import {
    GithubLogoIcon,
    type Icon,
    TelegramLogoIcon,
    XLogoIcon,
} from '@phosphor-icons/react';

interface HoverSwapIconProps {
    href: string;
    ariaLabel: string;
    Icon: Icon;
}

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

function SocialLinks() {
    return (
        <div className='flex flex-row justify-around gap-3 text-blue'>
            <HoverSwapIcon
                href='https://github.com/zkemail/redacted'
                ariaLabel='View project on Github'
                Icon={GithubLogoIcon}
            />
            <HoverSwapIcon
                href='https://x.com/zkemail'
                ariaLabel='Visit ZK Email on X'
                Icon={XLogoIcon}
            />
            <HoverSwapIcon
                href='https://t.me/zkemail'
                ariaLabel='Join ZK Email on Telegram'
                Icon={TelegramLogoIcon}
            />
        </div>
    );
}

export default function Footer() {
    return (
        <footer className='border-gray-mid flex-col lg:flex-row flex w-full items-center justify-between border-t px-8 py-6'>
            <img
                src="/logo.png"
                alt="zkMail Logo"
                className="max-h-[100px] h-auto w-auto"
            />
            <div className='flex flex-row items-center gap-6 my-4 lg:my-0'>
                <SocialLinks />
                <span className='text-gray-mid'>|</span>
                <a
                    href='https://github.com/zkemail/redacted'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-sm text-gray-mid hover:underline'
                >
                    Learn More
                </a>
                <span className='text-gray-mid'>|</span>
                <a
                    href='https://zk.email'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-sm text-gray-mid hover:underline'
                >
                    Built by ZK Email
                </a>
            </div>
        </footer>
    );
}
