import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HeaderModule } from './header/header.module';
import { FooterModule } from './footer/footer.module';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  imports: [ConfigModule, HeaderModule, FooterModule],
  providers: [CloudinaryService],
  exports: [HeaderModule, FooterModule, CloudinaryService],
})
export class CmsModule {}
