export interface ButtonStyle {
  backgroundColor: string;
  textColor: string;
  hoverColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  fontSize: number;
  fontWeight: number;
  paddingX: number;
  paddingY: number;
  shadow: string;
}

export interface CustomButton {
  id: string;
  label: string;
  url: string;
  enabled: boolean;
  target: '_self' | '_blank';
  internal: boolean;
  icon: 'none' | 'chevron' | 'sparkle' | 'arrow-right' | 'external';
  placement: 'hero' | 'nav' | 'navCta' | 'footer' | 'custom';
  style: ButtonStyle;
}

export interface ImageAssetConfig {
  id: string;
  name: string;
  url: string;
  alt: string;
  visible: boolean;
  fit?: 'cover' | 'contain' | 'fill' | 'none';
  opacity?: number;
  scale?: number;
}

export interface BeeKeyframe {
  x: number;
  y: number;
  s: number;
  yaw: number;
  pitch: number;
  roll: number;
}

export interface BeeAnimationConfig {
  enabled: boolean;
  speed: number;
  sizeMultiplier: number;
  hoverAmount: number;
  enableBanking: boolean;
  delay: number;
  repeat: boolean;
  respectReducedMotion: boolean;
  desktopKeyframes: BeeKeyframe[];
  mobileKeyframes: BeeKeyframe[];
}

export interface BrandingConfig {
  brandName: string;
  tagline: string;
  heroHeadlineLine1: string;
  heroHeadlineLine2: string;
  heroSubtext: string;
  s1Number: string;
  s1Title: string;
  s1Copy: string;
  s2Number: string;
  s2Title: string;
  s2Copy: string;
  s3Number: string;
  s3Title: string;
  s3Copy: string;
  footerHeading: string;
  footerBrandName: string;
  footerSubbrand: string;
  badgeText: string;
  badgeBrand: string;
  showLogoMark: boolean;
}

export interface TypographyConfig {
  fontFamily: string;
  headingFontFamily: string;
  headlineWeight: number;
  titleWeight: number;
  bodyWeight: number;
  letterSpacing: string;
}

export interface ThemeConfig {
  ink: string;
  muted: string;
  lilac: string;
  num: string;
  numDark: string;
  violet: string;
  heroBgColor: string;
  s1GradientStart: string;
  s1GradientEnd: string;
  s2BgColor: string;
  s3GradientStart: string;
  s3GradientEnd: string;
  footBgColor: string;
}

export interface SocialLink {
  id: string;
  platform: string;
  label: string;
  url: string;
  enabled: boolean;
  order: number;
}

export interface ContactConfig {
  email: string;
  phone: string;
  supportText: string;
  copyrightText: string;
  showEmail: boolean;
  showPhone: boolean;
}

export interface SiteSettings {
  version: number;
  lastUpdated: string;
  branding: BrandingConfig;
  buttons: CustomButton[];
  images: Record<string, ImageAssetConfig>;
  beeAnimation: BeeAnimationConfig;
  typography: TypographyConfig;
  theme: ThemeConfig;
  social: SocialLink[];
  contact: ContactConfig;
}

export interface StoredSettingsFile {
  published: SiteSettings;
  draft: SiteSettings | null;
}
