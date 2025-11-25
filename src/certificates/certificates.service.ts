import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Certificate } from './entities/additional.entity';
import * as crypto from 'crypto';

@Injectable()
export class CertificatesService {
  constructor(
    @InjectModel(Certificate.name) private certificateModel: Model<Certificate>,
  ) {}

  async generateCertificate(
    userId: string,
    courseId: string,
  ): Promise<Certificate> {
    // Check if certificate already exists
    const existing = await this.certificateModel.findOne({
      student: userId,
      course: courseId,
    });

    if (existing) {
      return existing;
    }

    // Generate unique certificate ID
    const certificateId = this.generateCertificateId();
    const certificateUrl = `${process.env.FRONTEND_URL}/certificates/${certificateId}`;

    const certificate = new this.certificateModel({
      student: userId,
      course: courseId,
      certificateId,
      issuedAt: new Date(),
      certificateUrl,
    });

    return await certificate.save();
  }

  async getUserCertificates(userId: string): Promise<Certificate[]> {
    return this.certificateModel
      .find({ student: userId })
      .populate('course', 'title instructor')
      .populate('student', 'firstName lastName')
      .sort({ issuedAt: -1 })
      .exec();
  }

  async verifyCertificate(certificateId: string): Promise<Certificate | null> {
    return this.certificateModel
      .findOne({ certificateId })
      .populate('course', 'title')
      .populate('student', 'firstName lastName')
      .exec();
  }

  async getCertificate(id: string): Promise<Certificate> {
    const certificate = await this.certificateModel
      .findById(id)
      .populate('course')
      .populate('student', 'firstName lastName email');

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  private generateCertificateId(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `CERT-${timestamp}-${random}`;
  }

  async getCourseCertificates(courseId: string): Promise<Certificate[]> {
    return this.certificateModel
      .find({ course: courseId })
      .populate('student', 'firstName lastName email')
      .sort({ issuedAt: -1 })
      .exec();
  }
}
