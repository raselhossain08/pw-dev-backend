import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HeaderNavigationDocument = HeaderNavigation & Document;

@Schema()
class Logo {
  @Prop({ required: true })
  dark: string;

  @Prop({ required: true })
  light: string;

  @Prop({ required: true })
  alt: string;
}

@Schema()
class CartItem {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true })
  price: number;

  @Prop({ required: true, default: 1 })
  quantity: number;

  @Prop({ required: true })
  instructor: string;
}

@Schema()
class Cart {
  @Prop({ required: true, default: 0 })
  itemCount: number;

  @Prop({ required: true, default: '/cart' })
  href: string;

  @Prop({ type: [CartItem], default: [] })
  items: CartItem[];
}

@Schema()
class SearchResult {
  @Prop({ required: true })
  id: number;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  oldPrice?: number;

  @Prop({ required: true, default: 5 })
  rating: number;

  @Prop({ required: true, default: 0 })
  reviewCount: number;
}

@Schema()
class SearchConfig {
  @Prop({ required: true, default: 'What are you looking for?' })
  placeholder: string;

  @Prop({ required: true, default: 'Search' })
  buttonText: string;

  @Prop({ required: true, default: 4 })
  resultsPerPage: number;

  @Prop({ type: [SearchResult], default: [] })
  mockResults: SearchResult[];
}

@Schema()
class NavigationLink {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  href: string;

  @Prop({ required: true })
  icon: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  badge?: string;
}

@Schema()
class Submenu {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  icon: string;

  @Prop({ type: [NavigationLink], required: true })
  links: NavigationLink[];
}

@Schema()
class FeaturedCourse {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  image: string;

  @Prop({ required: true })
  href: string;

  @Prop({ required: true })
  badge: string;
}

@Schema()
class MenuItem {
  @Prop({ required: true })
  title: string;

  @Prop()
  href?: string;

  @Prop({ required: true })
  hasDropdown: boolean;

  @Prop({ required: true })
  icon: string;

  @Prop()
  description?: string;

  @Prop({ type: FeaturedCourse })
  featured?: FeaturedCourse;

  @Prop({ type: [Submenu] })
  submenus?: Submenu[];
}

@Schema()
class Navigation {
  @Prop({ type: [MenuItem], required: true })
  menuItems: MenuItem[];
}

@Schema()
class UserProfile {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  avatar: string;

  @Prop({ required: true })
  avatarFallback: string;

  @Prop({ required: true })
  profileLink: string;
}

@Schema()
class UserMenuItem {
  @Prop({ required: true })
  icon: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  href: string;

  @Prop({ required: true })
  description: string;
}

@Schema()
class UserMenuLink {
  @Prop({ required: true })
  icon: string;

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  href: string;
}

@Schema()
class UserMenu {
  @Prop({ type: UserProfile, required: true })
  profile: UserProfile;

  @Prop({ required: true, default: true })
  isLoggedIn: boolean;

  @Prop({ type: [UserMenuItem], required: true })
  menuItems: UserMenuItem[];

  @Prop({ type: [UserMenuLink], required: true })
  supportLinks: UserMenuLink[];

  @Prop({ type: [UserMenuLink], required: true })
  settingsLinks: UserMenuLink[];
}

@Schema()
class CallToAction {
  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  href: string;

  @Prop({ required: true, default: 'default' })
  variant: string;
}

@Schema({ timestamps: true })
export class HeaderNavigation {
  @Prop({ type: Logo, required: true })
  logo: Logo;

  @Prop({ type: Cart, required: true })
  cart: Cart;

  @Prop({ type: SearchConfig, required: true })
  search: SearchConfig;

  @Prop({ type: Navigation, required: true })
  navigation: Navigation;

  @Prop({ type: UserMenu, required: true })
  userMenu: UserMenu;

  @Prop({ type: CallToAction, required: true })
  cta: CallToAction;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const HeaderNavigationSchema =
  SchemaFactory.createForClass(HeaderNavigation);

// Configure JSON transformation to properly serialize ObjectIds
HeaderNavigationSchema.set('toJSON', {
  transform: function (_doc: any, ret: any) {
    if (ret._id) ret._id = ret._id.toString();
    return ret;
  },
});

HeaderNavigationSchema.index({ isActive: 1 });
