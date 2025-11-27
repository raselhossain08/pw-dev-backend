import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import * as bcrypt from 'bcryptjs';

async function createAdmin() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const usersService = app.get(UsersService);

    try {
        const adminEmail = 'raselhossain86666@gmail.com';

        // Check if admin already exists
        const existingUser = await usersService.findByEmail(adminEmail);

        if (existingUser) {
            console.log('Admin user already exists:', adminEmail);
            await app.close();
            return;
        }

        // Hash password
        const hashedPassword = await bcrypt.hash('Admin123@@', 10);

        // Create super admin user
        const adminUser = await usersService.create({
            firstName: 'Rasel',
            lastName: 'Hossain',
            email: adminEmail,
            password: hashedPassword,
            role: UserRole.SUPER_ADMIN,
            status: UserStatus.ACTIVE,
        });

        console.log('✅ Super Admin user created successfully!');
        console.log('Email:', adminEmail);
        console.log('Password: Admin123@@');
        console.log('Role:', adminUser.role);
        console.log('User ID:', adminUser._id);
    } catch (error) {
        console.error('❌ Error creating admin user:', error.message);
    } finally {
        await app.close();
    }
}

createAdmin();
