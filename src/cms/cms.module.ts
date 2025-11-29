import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HeaderModule } from './header/header.module';
import { FooterModule } from './footer/footer.module';
import { HomeModule } from './home/home.module';
import { ContactModule } from './contact/contact.module';
import { FaqsModule } from './faqs/faqs.module';
import { CloudinaryService } from './services/cloudinary.service';

@Module({
  imports: [ConfigModule, HeaderModule, FooterModule, HomeModule, ContactModule, FaqsModule],
  providers: [CloudinaryService],
  exports: [HeaderModule, FooterModule, HomeModule, ContactModule, FaqsModule, CloudinaryService],
})
export class CmsModule {}
