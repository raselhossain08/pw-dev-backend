import { Controller, Get, Post, Body, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CourseCategoriesService } from './course-categories.service';
import { Public } from '../shared/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../shared/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Course Categories')
@Controller('course-categories')
export class CourseCategoriesController {
  constructor(private readonly service: CourseCategoriesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'List active course category names' })
  @ApiResponse({ status: 200, description: 'Array of category names' })
  async list() {
    return this.service.listActiveNames();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Add a new course category' })
  @ApiResponse({ status: 201, description: 'Category added' })
  async add(@Body() body: { name: string }) {
    return this.service.add(body?.name);
  }

  @Delete(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Delete a course category by slug' })
  @ApiResponse({ status: 200, description: 'Category deleted' })
  async remove(@Param('slug') slug: string) {
    return this.service.removeBySlug(slug);
  }
}
