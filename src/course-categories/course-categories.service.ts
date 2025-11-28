import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CourseCategory } from './entities/course-category.entity';

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

@Injectable()
export class CourseCategoriesService {
  constructor(
    @InjectModel(CourseCategory.name)
    private categoryModel: Model<CourseCategory>,
  ) {}

  async listActiveNames(): Promise<string[]> {
    const rows = await this.categoryModel
      .find({ isActive: true })
      .sort({ name: 1 })
      .lean()
      .exec();
    return rows.map((r) => r.name);
  }

  async add(name: string) {
    const clean = name?.trim();
    if (!clean) throw new BadRequestException('Category name is required');
    const slug = slugify(clean);
    const exists = await this.categoryModel
      .findOne({ $or: [{ name: clean }, { slug }] })
      .lean()
      .exec();
    if (exists) return exists; // idempotent
    return this.categoryModel.create({ name: clean, slug, isActive: true });
  }

  async removeBySlug(slug: string) {
    const res = await this.categoryModel
      .findOneAndDelete({ slug })
      .lean()
      .exec();
    if (!res) throw new NotFoundException('Category not found');
    return { success: true };
  }
}
