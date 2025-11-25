import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { StripeService } from './providers/stripe.service';
import { PayPalService } from './providers/paypal.service';
import { OrdersService } from '../orders/orders.service';
import { CoursesService } from '../courses/courses.service';
import { Invoice } from './entities/invoice.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from './entities/transaction.entity';
import { CreatePaymentIntentDto } from './dto/create-payment-intent.dto';
import { ProcessPaymentDto } from './dto/process-payment.dto';
import {
  Order,
  OrderStatus,
  PaymentMethod,
} from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<Invoice>,
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private configService: ConfigService,
    private stripeService: StripeService,
    private paypalService: PayPalService,
    private ordersService: OrdersService,
    private coursesService: CoursesService,
  ) {}

  async createPaymentIntent(
    createPaymentIntentDto: CreatePaymentIntentDto,
    userId: string,
  ) {
    const { amount, currency, paymentMethod, courseIds, description } =
      createPaymentIntentDto;

    const order = await this.ordersService.create({
      user: userId,
      courses: courseIds || [],
      subtotal: amount,
      total: amount,
      paymentMethod,
    });

    const metadata = {
      orderId: order.id,
      userId,
      courseIds: courseIds?.join(','),
    };

    let paymentResult;

    switch (paymentMethod) {
      case PaymentMethod.STRIPE:
        paymentResult = await this.stripeService.createPaymentIntent(
          amount,
          currency,
          metadata,
        );
        break;

      case PaymentMethod.PAYPAL:
        const items = courseIds ? await this.getCourseItems(courseIds) : [];
        paymentResult = await this.paypalService.createOrder(
          amount,
          currency,
          items,
        );
        break;

      default:
        throw new BadRequestException('Unsupported payment method');
    }

    await this.orderModel.findByIdAndUpdate(order.id, {
      paymentIntentId: paymentResult.paymentIntentId || paymentResult.orderId,
    });

    // Create transaction record
    await this.createTransaction({
      user: new Types.ObjectId(userId),
      amount,
      currency,
      type: TransactionType.PAYMENT,
      status: TransactionStatus.PENDING,
      description: description || 'Course payment',
      gateway: paymentMethod,
      gatewayTransactionId:
        paymentResult.paymentIntentId || paymentResult.orderId,
      orderId: order.id,
    });

    return {
      ...paymentResult,
      orderNumber: order.orderNumber,
    };
  }

  async processPayment(processPaymentDto: ProcessPaymentDto, userId: string) {
    const { paymentIntentId, paymentMethod, orderNumber } = processPaymentDto;

    let order;
    if (orderNumber) {
      order = await this.orderModel.findOne({ orderNumber, user: userId });
    } else {
      order = await this.orderModel.findOne({ paymentIntentId, user: userId });
    }

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    let paymentResult;

    try {
      switch (paymentMethod) {
        case PaymentMethod.STRIPE:
          paymentResult =
            await this.stripeService.confirmPayment(paymentIntentId);
          break;

        case PaymentMethod.PAYPAL:
          paymentResult =
            await this.paypalService.captureOrder(paymentIntentId);
          break;

        default:
          throw new BadRequestException('Unsupported payment method');
      }

      if (paymentResult.success || paymentResult.status === 'COMPLETED') {
        order.status = OrderStatus.COMPLETED;
        order.paidAt = new Date();
        order.chargeId = paymentResult.captureId || paymentResult.charge;
        await order.save();

        await this.createInvoice(order);
        await this.updateTransaction(
          paymentIntentId,
          TransactionStatus.COMPLETED,
          { gatewayResponse: paymentResult },
        );

        for (const courseId of order.courses) {
          await this.coursesService.incrementEnrollment(courseId.toString());
          await this.coursesService.addRevenue(
            courseId.toString(),
            order.total,
          );
        }

        return {
          success: true,
          order: order.orderNumber,
          message: 'Payment processed successfully',
        };
      } else {
        throw new BadRequestException('Payment processing failed');
      }
    } catch (error) {
      await this.orderModel.findByIdAndUpdate(order.id, {
        status: OrderStatus.FAILED,
      });

      await this.updateTransaction(paymentIntentId, TransactionStatus.FAILED, {
        failureReason: error.message,
      });

      throw new BadRequestException(`Payment failed: ${error.message}`);
    }
  }

  async createTransaction(
    transactionData: Partial<Transaction>,
  ): Promise<Transaction> {
    const transaction = new this.transactionModel({
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...transactionData,
    });
    return await transaction.save();
  }

  async updateTransaction(
    gatewayTransactionId: string,
    status: TransactionStatus,
    updates: any = {},
  ): Promise<Transaction> {
    const transaction = await this.transactionModel.findOneAndUpdate(
      { gatewayTransactionId },
      {
        status,
        ...updates,
        ...(status === TransactionStatus.COMPLETED && {
          processedAt: new Date(),
        }),
      },
      { new: true },
    );

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async getUserTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ transactions: Transaction[]; total: number }> {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.transactionModel.countDocuments({ user: userId }),
    ]);

    return { transactions, total };
  }

  async handleStripeWebhook(payload: any, signature: string) {
    const { event, type } = await this.stripeService.handleWebhook(
      payload,
      signature,
    );

    switch (type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSuccess(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await this.handleSubscriptionPayment(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${type}`);
    }

    return { received: true };
  }

  async handlePayPalWebhook(payload: any, headers: any) {
    const eventType = payload.event_type;

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handlePayPalPaymentSuccess(payload);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
        await this.handlePayPalPaymentFailure(payload);
        break;

      default:
        console.log(`Unhandled PayPal event: ${eventType}`);
    }

    return { received: true };
  }

  async getUserInvoices(userId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      this.invoiceModel
        .find({ user: userId })
        .populate('order')
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.invoiceModel.countDocuments({ user: userId }),
    ]);

    return { invoices, total, page, limit };
  }

  async getInvoice(invoiceId: string, userId: string) {
    const invoice = await this.invoiceModel
      .findOne({ _id: invoiceId, user: userId })
      .populate('order')
      .populate('user', 'firstName lastName email')
      .exec();

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async requestRefund(orderId: string, reason: string, userId: string) {
    const order = await this.orderModel.findOne({ _id: orderId, user: userId });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('Only completed orders can be refunded');
    }

    if (!order.paymentIntentId) {
      throw new BadRequestException('No payment information found for refund');
    }

    const refundDeadline = new Date(order.paidAt);
    refundDeadline.setDate(refundDeadline.getDate() + 30);

    if (new Date() > refundDeadline) {
      throw new BadRequestException('Refund period has expired');
    }

    let refundResult;

    try {
      if (order.paymentMethod === PaymentMethod.STRIPE) {
        refundResult = await this.stripeService.refundPayment(
          order.paymentIntentId,
        );
      } else {
        throw new BadRequestException(
          'Refunds for this payment method are not yet supported',
        );
      }

      order.status = OrderStatus.REFUNDED;
      order.refund = {
        amount: order.total,
        reason,
        processedAt: new Date(),
        processedBy: new Types.ObjectId(userId),
      };
      await order.save();

      await this.createTransaction({
        user: new Types.ObjectId(userId),
        amount: -order.total,
        currency: 'USD',
        type: TransactionType.REFUND,
        status: TransactionStatus.COMPLETED,
        description: `Refund for order ${order.orderNumber}`,
        gateway: order.paymentMethod,
        gatewayTransactionId: refundResult.id,
        orderId: order.id,
      });

      return {
        success: true,
        refundId: refundResult.id,
        message: 'Refund processed successfully',
      };
    } catch (error) {
      throw new BadRequestException(`Refund failed: ${error.message}`);
    }
  }

  private async createInvoice(order: Order) {
    const invoiceNumber = `INV-${new Date().getFullYear()}-${((await this.invoiceModel.countDocuments()) + 1).toString().padStart(4, '0')}`;

    const invoice = new this.invoiceModel({
      invoiceNumber,
      order: order.id,
      user: order.user,
      amount: order.subtotal,
      tax: order.tax,
      total: order.total,
      status: 'paid',
      invoiceDate: new Date(),
      dueDate: new Date(),
      billingInfo: order.billingAddress
        ? {
            companyName: `${order.billingAddress.firstName} ${order.billingAddress.lastName}`,
            address: order.billingAddress.street,
            city: order.billingAddress.city,
            state: order.billingAddress.state,
            zipCode: order.billingAddress.zipCode,
            country: order.billingAddress.country,
            taxId: '',
          }
        : {
            companyName: 'Personal Wings',
            address: '123 Aviation Way',
            city: 'Sky Harbor',
            state: 'AZ',
            zipCode: '85034',
            country: 'US',
            taxId: 'TAX-123456',
          },
      items: [
        {
          description: 'Course Enrollment',
          quantity: 1,
          unitPrice: order.subtotal,
          total: order.subtotal,
        },
      ],
      paidAt: order.paidAt,
    });

    return await invoice.save();
  }

  private async getCourseItems(courseIds: string[]) {
    const courses = await this.coursesService.findByIds(courseIds);
    return courses.map((course) => ({
      name: course.title,
      description: course.excerpt || 'Aviation training course',
      quantity: 1,
      price: course.price,
    }));
  }

  private async handlePaymentSuccess(paymentIntent: any) {
    const order = await this.orderModel.findOne({
      paymentIntentId: paymentIntent.id,
    });
    if (order) {
      order.status = OrderStatus.COMPLETED;
      order.paidAt = new Date();
      await order.save();

      await this.updateTransaction(
        paymentIntent.id,
        TransactionStatus.COMPLETED,
        { gatewayResponse: paymentIntent },
      );
    }
  }

  private async handlePaymentFailure(paymentIntent: any) {
    const order = await this.orderModel.findOne({
      paymentIntentId: paymentIntent.id,
    });
    if (order) {
      order.status = OrderStatus.FAILED;
      await order.save();

      await this.updateTransaction(paymentIntent.id, TransactionStatus.FAILED, {
        failureReason:
          paymentIntent.last_payment_error?.message || 'Payment failed',
      });
    }
  }

  private async handleSubscriptionPayment(invoice: any) {
    console.log('Subscription payment handled:', invoice.id);
  }

  private async handlePayPalPaymentSuccess(payload: any) {
    const order = await this.orderModel.findOne({
      paymentIntentId: payload.resource.id,
    });
    if (order) {
      order.status = OrderStatus.COMPLETED;
      order.paidAt = new Date();
      await order.save();

      await this.updateTransaction(
        payload.resource.id,
        TransactionStatus.COMPLETED,
        { gatewayResponse: payload },
      );
    }
  }

  private async handlePayPalPaymentFailure(payload: any) {
    const order = await this.orderModel.findOne({
      paymentIntentId: payload.resource.id,
    });
    if (order) {
      order.status = OrderStatus.FAILED;
      await order.save();

      await this.updateTransaction(
        payload.resource.id,
        TransactionStatus.FAILED,
        {
          failureReason:
            payload.resource.status_details?.reason || 'Payment failed',
        },
      );
    }
  }
}
