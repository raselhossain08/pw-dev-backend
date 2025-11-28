import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HeaderModule } from './header/header.module';
import { FooterModule } from './footer/footer.module';
import { HomeModule } from './home/home.module';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  imports: [ConfigModule, HeaderModule, FooterModule, HomeModule],
  providers: [CloudinaryService],
  exports: [HeaderModule, FooterModule, HomeModule, CloudinaryService],
})
export class CmsModule {}
