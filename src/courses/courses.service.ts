import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseStatus } from './entities/course.entity';
import { Lesson } from './entities/lesson.entity';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Lesson.name) private lessonModel: Model<Lesson>,
  ) {}

  async create(
    createCourseDto: CreateCourseDto,
    instructorId: string,
  ): Promise<Course> {
    const existingCourse = await this.courseModel.findOne({
      slug: createCourseDto.slug,
    });
    if (existingCourse) {
      throw new ConflictException('Course with this slug already exists');
    }

    const course = new this.courseModel({
      ...createCourseDto,
      instructor: new Types.ObjectId(instructorId),
    });

    return await course.save();
  }

  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    level?: string,
    status?: CourseStatus,
    instructorId?: string,
  ): Promise<{ courses: Course[]; total: number }> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
      ];
    }

    if (level) {
      query.level = level;
    }

    if (status) {
      query.status = status;
    }

    if (instructorId) {
      query.instructor = new Types.ObjectId(instructorId);
    }

    const [courses, total] = await Promise.all([
      this.courseModel
        .find(query)
        .populate('instructor', 'firstName lastName email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.courseModel.countDocuments(query),
    ]);

    return { courses, total };
  }

  async findById(id: string): Promise<Course> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Course not found');
    }

    const course = await this.courseModel
      .findById(id)
      .populate(
        'instructor',
        'firstName lastName email avatar bio certifications flightHours',
      )
      .exec();

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  async findBySlug(slug: string): Promise<Course> {
    const course = await this.courseModel
      .findOne({ slug, status: CourseStatus.PUBLISHED })
      .populate(
        'instructor',
        'firstName lastName email avatar bio certifications flightHours',
      )
      .exec();

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  async findByIds(ids: string[]): Promise<Course[]> {
    if (!ids.length) return [];

    const objectIds = ids.map((id) => {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(`Invalid course ID: ${id}`);
      }
      return new Types.ObjectId(id);
    });

    return await this.courseModel.find({ _id: { $in: objectIds } }).exec();
  }

  async update(
    id: string,
    updateCourseDto: UpdateCourseDto,
    userId: string,
    userRole: UserRole,
  ): Promise<Course> {
    const course = await this.findById(id);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN &&
      course.instructor.toString() !== userId
    ) {
      throw new ForbiddenException('You can only update your own courses');
    }

    if (updateCourseDto.slug && updateCourseDto.slug !== course.slug) {
      const existingCourse = await this.courseModel.findOne({
        slug: updateCourseDto.slug,
        _id: { $ne: id },
      });
      if (existingCourse) {
        throw new ConflictException('Course with this slug already exists');
      }
    }

    const updatedCourse = await this.courseModel
      .findByIdAndUpdate(id, updateCourseDto, { new: true })
      .populate('instructor', 'firstName lastName email avatar');

    if (!updatedCourse) {
      throw new NotFoundException('Course not found');
    }

    return updatedCourse;
  }

  async remove(id: string, userId: string, userRole: UserRole): Promise<void> {
    const course = await this.findById(id);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN &&
      course.instructor.toString() !== userId
    ) {
      throw new ForbiddenException('You can only delete your own courses');
    }

    await this.lessonModel.deleteMany({ course: id });
    const result = await this.courseModel.findByIdAndDelete(id);

    if (!result) {
      throw new NotFoundException('Course not found');
    }
  }

  async getFeaturedCourses(limit: number = 6): Promise<Course[]> {
    return await this.courseModel
      .find({
        status: CourseStatus.PUBLISHED,
        isFeatured: true,
      })
      .populate('instructor', 'firstName lastName email avatar')
      .sort({ rating: -1, studentCount: -1 })
      .limit(limit)
      .exec();
  }

  async getInstructorCourses(
    instructorId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ courses: Course[]; total: number }> {
    return this.findAll(
      page,
      limit,
      undefined,
      undefined,
      undefined,
      instructorId,
    );
  }

  // Lesson Management
  async createLesson(
    courseId: string,
    createLessonDto: CreateLessonDto,
    instructorId: string,
  ): Promise<Lesson> {
    const course = await this.findById(courseId);

    if (course.instructor.toString() !== instructorId) {
      throw new ForbiddenException(
        'You can only add lessons to your own courses',
      );
    }

    const existingLesson = await this.lessonModel.findOne({
      course: courseId,
      slug: createLessonDto.slug,
    });
    if (existingLesson) {
      throw new ConflictException(
        'Lesson with this slug already exists in this course',
      );
    }

    const lesson = new this.lessonModel({
      ...createLessonDto,
      course: courseId,
    });

    return await lesson.save();
  }

  async getCourseLessons(
    courseId: string,
    userId?: string,
    userRole?: UserRole,
  ): Promise<Lesson[]> {
    const course = await this.findById(courseId);

    const query: any = { course: courseId };
    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN &&
      course.instructor.toString() !== userId
    ) {
      query.status = 'published';
    }

    return await this.lessonModel.find(query).sort({ order: 1 }).exec();
  }

  async updateLesson(
    lessonId: string,
    updateData: any,
    userId: string,
    userRole: UserRole,
  ): Promise<Lesson> {
    const lesson = await this.lessonModel.findById(lessonId).populate('course');
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const course = lesson.course as Course;

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN &&
      course.instructor.toString() !== userId
    ) {
      throw new ForbiddenException(
        'You can only update lessons in your own courses',
      );
    }

    const updatedLesson = await this.lessonModel.findByIdAndUpdate(
      lessonId,
      updateData,
      { new: true },
    );

    if (!updatedLesson) {
      throw new NotFoundException('Lesson not found');
    }

    return updatedLesson;
  }

  async getStats(): Promise<any> {
    const totalCourses = await this.courseModel.countDocuments();
    const publishedCourses = await this.courseModel.countDocuments({
      status: CourseStatus.PUBLISHED,
    });
    const totalEnrollments = await this.courseModel.aggregate([
      { $group: { _id: null, total: { $sum: '$studentCount' } } },
    ]);
    const totalRevenue = await this.courseModel.aggregate([
      { $group: { _id: null, total: { $sum: '$totalRevenue' } } },
    ]);

    const topCourses = await this.courseModel
      .find({ status: CourseStatus.PUBLISHED })
      .sort({ totalRevenue: -1 })
      .limit(5)
      .select('title totalRevenue studentCount rating')
      .exec();

    return {
      totalCourses,
      publishedCourses,
      totalEnrollments: totalEnrollments[0]?.total || 0,
      totalRevenue: totalRevenue[0]?.total || 0,
      topCourses,
    };
  }

  async incrementEnrollment(
    courseId: string,
    amount: number = 1,
  ): Promise<void> {
    await this.courseModel.findByIdAndUpdate(courseId, {
      $inc: { studentCount: amount, totalEnrollments: amount },
    });
  }

  async addRevenue(courseId: string, amount: number): Promise<void> {
    await this.courseModel.findByIdAndUpdate(courseId, {
      $inc: { totalRevenue: amount },
    });
  }

  async getEnrollmentsByDateRange(dateRange: {
    start: Date;
    end: Date;
  }): Promise<any[]> {
    return await this.courseModel.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lte: dateRange.end },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          count: { $sum: '$studentCount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);
  }

  async count(): Promise<number> {
    return await this.courseModel.countDocuments();
  }

  async getEnrollmentsByCountry(): Promise<any[]> {
    return await this.courseModel.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'instructor',
          foreignField: '_id',
          as: 'instructor',
        },
      },
      {
        $unwind: '$instructor',
      },
      {
        $group: {
          _id: '$instructor.country',
          count: { $sum: '$studentCount' },
          revenue: { $sum: '$totalRevenue' },
        },
      },
      { $sort: { count: -1 } },
    ]);
  }
}
