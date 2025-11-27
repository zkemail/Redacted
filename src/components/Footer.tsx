import {
    GithubLogoIcon,
    type Icon,
    TelegramLogoIcon,
    XLogoIcon,
    YoutubeLogoIcon,
} from '@phosphor-icons/react';

interface HoverSwapIconProps {
    href: string;
    ariaLabel: string;
    Icon: Icon;
}

const developersLinks: FooterItem[] = [
    { type: 'heading', name: 'Developers' },
    { type: 'link', name: 'Docs', href: 'https://docs.zk.email' },
    { type: 'link', name: 'Projects', href: 'https://zk.email/projects' },
    { type: 'link', name: 'Changelogs', href: 'https://zk.email/changelogs' },
];

const communityLinks: FooterItem[] = [
    { type: 'heading', name: 'Community' },
    { type: 'link', name: 'Blogs', href: 'https://zk.email/blog' },
    { type: 'link', name: 'Case Studies', href: 'https://zk.email/case-studies' },
    { type: 'link', name: 'Partner', href: 'https://t.me/zkemail' },
    { type: 'link', name: 'Privacy Policy', href: 'https://zk.email/privacy-policy' },
];

export const HoverSwapIcon = ({
    href,
    ariaLabel,
    Icon,
}: HoverSwapIconProps) => (
    <a
        href={href}
        aria-label={ariaLabel}
        target='_blank'
        rel='noopener noreferrer'
        className='group relative inline-block size-5'
    >
        {/* Outline (Regular) Icon */}
        <Icon
            className='absolute inset-0 h-full w-full transition-opacity duration-300 group-hover:opacity-0'
            weight='regular'
        />

        {/* Solid (Fill) Icon */}
        <Icon
            className='absolute inset-0 h-full w-full opacity-0 transition-opacity duration-300 group-hover:opacity-100'
            weight='fill'
        />
    </a>
);

type FooterItem =
  | { type: 'heading'; name: string }
  | { type: 'link'; name: string; href: string };

interface FooterLinksProps {
  items: FooterItem[];
}

function FooterLinks({ items }: FooterLinksProps) {
  return (
    <div className='flex flex-col items-center text-sm leading-tight gap-3'>
      {items.map((item, idx) =>
        item.type === 'heading' ? (
          <span
            key={idx}
            className='font-semibold text-blue'
          >
            {item.name}
          </span>
        ) : (
          <a
            key={idx}
            href={item.href}
            className="transition-colors hover:underline font-normal text-sm tracking-[-0.02em] text-gray-mid"
            target={item.href.startsWith('http') ? '_blank' : undefined}
            rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          >
            {item.name}
          </a>
        )
      )}
    </div>
  );
}

function SocialLinks() {
    return (
        <div className='flex flex-row justify-around gap-3'>
            <HoverSwapIcon
                href='https://www.youtube.com/@zkemail'
                ariaLabel='Visit us on Youtube'
                Icon={YoutubeLogoIcon}
            />
            <HoverSwapIcon
                href='https://x.com/zkemail'
                ariaLabel='Visit us on X'
                Icon={XLogoIcon}
            />
            <HoverSwapIcon
                href='https://t.me/zkemail'
                ariaLabel='Visit us on Telegram'
                Icon={TelegramLogoIcon}
            />
            <HoverSwapIcon
                href='https://github.com/zkemail'
                ariaLabel='Visit us on Github'
                Icon={GithubLogoIcon}
            />
        </div>
    );
}

export default function Footer() {
    return (
        <footer className='border-gray-mid flex-col lg:flex-row flex w-full items-center justify-between border-t'>
            <img
                src="/logo.png"
                alt="zkMail Logo"
                className="max-h-[163px] h-auto w-auto"
            />
            <div className='flex flex-row gap-9 text-blue mx-12 my-9'>
                <FooterLinks items={developersLinks} />
                <FooterLinks items={communityLinks} />
                <SocialLinks />
            </div>
        </footer>
    );
}
