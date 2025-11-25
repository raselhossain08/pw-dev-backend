import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';

async function seed() {
  const logger = new Logger('DatabaseSeed');
  const app = await NestFactory.create(AppModule);

  try {
    const configService = app.get(ConfigService);
    const usersService = app.get(UsersService);

    // Create admin user
    const adminEmail = configService.get(
      'ADMIN_EMAIL',
      'admin@personalwings.com',
    );
    const adminPassword = configService.get(
      'ADMIN_PASSWORD',
      'SecureAdmin123!',
    );

    const existingAdmin = await usersService.findByEmail(adminEmail);

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(adminPassword, 12);

      const admin = await usersService.create({
        email: adminEmail,
        firstName: 'Admin',
        lastName: 'User',
        password: hashedPassword,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      });

      logger.log(`✅ Admin user created: ${adminEmail}`);
    } else {
      logger.log(`⚠️  Admin user already exists: ${adminEmail}`);
    }

    // Create sample instructor
    const instructorEmail = 'instructor@personalwings.com';
    const existingInstructor = await usersService.findByEmail(instructorEmail);

    if (!existingInstructor) {
      const hashedPassword = await bcrypt.hash('instructor123', 12);

      await usersService.create({
        email: instructorEmail,
        firstName: 'John',
        lastName: 'Instructor',
        password: hashedPassword,
        role: UserRole.INSTRUCTOR,
        status: UserStatus.ACTIVE,
      });

      logger.log(`✅ Sample instructor created: ${instructorEmail}`);
    }

    // Create sample student
    const studentEmail = 'student@personalwings.com';
    const existingStudent = await usersService.findByEmail(studentEmail);

    if (!existingStudent) {
      const hashedPassword = await bcrypt.hash('student123', 12);

      await usersService.create({
        email: studentEmail,
        firstName: 'Jane',
        lastName: 'Student',
        password: hashedPassword,
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
      });

      logger.log(`✅ Sample student created: ${studentEmail}`);
    }

    logger.log('🎉 Database seeding completed successfully!');
  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
  } finally {
    await app.close();
  }
}

seed();
