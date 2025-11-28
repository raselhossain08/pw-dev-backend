import { Module } from '@nestjs/common';
import { BannerModule } from './banner/banner.module';
import { AboutSectionModule } from './about-section/about-section.module';

@Module({
  imports: [BannerModule, AboutSectionModule],
  exports: [BannerModule, AboutSectionModule],
})
export class HomeModule {}
