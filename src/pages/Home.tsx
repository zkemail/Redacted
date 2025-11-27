import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import HomeHeader from '../components/HomeHeader';
import './Home.css';

const PageSection = ({
  children,
  height = 'h-auto',
  solid = false,
}: {
  children?: React.ReactNode;
  height?: string;
  solid?: boolean;
}) => (
  <div className={`${height} w-full flex flex-row bg-white`}>

    <div className="flex h-full basis-[10%] sm:basis-[23%]" />
    <div
      className={`
        flex justify-center items-center h-full text-black 
        basis-[80%] sm:basis-[54%] 
        ${solid ? 'border-x border-light' : 'vertical-dashed-lines'}
      `}
    >
      {children}
    </div>
    <div className="flex h-full basis-[10%] sm:basis-[23%]" />
  </div>
);


const Separator = ({
  solid = false,
}: {
  solid?: boolean;
}) => {
  if (solid) {
    return (
      <div className="relative w-full flex flex-row">
        <div className="relative flex basis-[10%] sm:basis-[23%]">
          <div className="horizontal-dashed-line absolute top-0 left-0 right-0" />
        </div>
        <div className="relative flex basis-[80%] sm:basis-[54%] border-t border-light">
          <div
            className="cross-icon absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2"
          />
          <div
            className="cross-icon absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2"
          />
        </div>
        <div className="relative flex basis-[10%] sm:basis-[23%]">
          <div className="horizontal-dashed-line absolute top-0 left-0 right-0" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full flex">
      <div className="horizontal-dashed-line" />
      <div
        className="cross-icon absolute left-[10%] sm:left-[23%] top-1/2 -translate-x-1/2 -translate-y-1/2"
      />
      <div
        className="cross-icon absolute right-[10%] sm:right-[23%] top-1/2 translate-x-1/2 -translate-y-1/2"
      />
    </div>
  );
};


export default function Home() {
  return (
    <div className="w-full flex flex-col justify-start items-center h-auto bg-white">
      <HomeHeader />
      <div className="w-full">
        <PageSection height="h-44" />
        <Separator />
        <PageSection>
          <div className="flex flex-col gap-8 my-6 justify-center items-center">
            <div className="flex flex-col text-3xl lg:text-5xl font-heading text-center px-3 py-2">
              <div className="mx-2">Reveal the truth anonymously</div>
              <div className="relative inline-block mx-auto px-2">
                <span className="relative z-10">protect your identity.</span>
                <span className="absolute -inset-1 sm:-inset-2 md:-inset-3 z-0 bg-[url('/heading-bg.png')] bg-no-repeat bg-center sm:bg-contain bg-cover" />
              </div>
            </div>
            <div className="text-center max-w-[540px] text-dark">
              Prove any sensitive information received on your mail without
              revealing your identity. Powered by zero knowledge.
            </div>
            <div className="flex justify-center items-center gap-4">
              <Link
                to="/app"
                className="px-4 py-2 bg-darker text-white sm:text-base text-xs"
              >
                Prove an Email
              </Link>
            </div>
          </div>
        </PageSection>
        <Separator />
        <PageSection height="h-32" />
        <Separator solid />
        <PageSection solid>
          <img
            src="/email-illustration.png"
            alt="An illustration of a stylized email inbox interface"
            className="h-full w-auto -mt-2 scale-x-[1.031] scale-y-[1.046] translate-y-0.5"
          />
        </PageSection>
        <Separator solid />
        <PageSection height="h-32" />
        <Separator solid />
        <PageSection solid>
          <div>
            <img
              src="/power-of-zk.png"
              alt="Abstract illustration of a brain with network connections, symbolizing the power of zero-knowledge proofs"
              className="h-full w-auto"
            />
            <div className="p-6 flex flex-col gap-2">
              <div className="border border-light text-sm md:px-3 py-1 inline-block mb-4 self-start">
                Cutting Edge Mathematics
              </div>
              <div className="text-2xl lg:text-4xl font-heading">
                Power of zero-knowledge
              </div>
              <div className="font-light font-body text-base leading-5 tracking-0 text-dark">
                We use advanced cryptography to keep your identity safe.
                Seriously, no one (not even us) has a clue about the hidden info
                in your email.
              </div>
            </div>
          </div>
        </PageSection>
        <Separator solid />
        <PageSection height="h-32" />
        <Separator solid />
        <PageSection solid>
          <div className="flex flex-col p-6 gap-9">
            <div className="flex flex-col gap-2">
              <div className="text-2xl lg:text-4xl font-heading">
                Battle-tested technology
              </div>
              <div className="font-light font-body text-base leading-5 tracking-0 text-dark">
                Top teams worldwide trust our zk technology and client-side
                proving.{' '}
              </div>
            </div>
            <img
              src="/company-logos.png"
              alt="Logos of companies including 0xparc, Privacy and Scaling Explorations, and a16z crypto"
              className="h-full w-auto"
            />
          </div>
        </PageSection>
        <Separator solid />
        <PageSection height="h-32" />
        <Separator solid />
        <PageSection solid>
          <div>
            <img
              src="/security-illustration.png"
              alt="An illustration of a shield, representing security and data protection"
              className="h-full w-auto"
            />
            <div className="p-6 flex flex-col gap-2">
              <div className="border border-light px-3 py-1 text-sm inline-block mb-4 w-max">
                Local Proving
              </div>
              <div className="text-2xl lg:text-4xl font-heading">
                Your email stays securely on your device
              </div>
              <div className="font-light font-body text-base leading-5 tracking-0 text-dark">
                With our awesome client-side feature, your original email stays
                on your device forever. We never send it to our servers!{' '}
              </div>
            </div>
          </div>
        </PageSection>
        <Separator solid />
        <PageSection height="h-32" />
        <Separator solid />
        <PageSection solid>
          <div className="flex flex-col p-6 gap-9">
            <div className="flex flex-col gap-2">
              <div className="text-2xl lg:text-4xl font-heading">
                Just 4 simple steps, that's all!
              </div>
              <div className="font-light font-body text-base leading-5 tracking-0 text-dark">
                Whistleblow any email you got in your inbox by following these 4
                easy steps.
              </div>
            </div>
            <img
              src="/4-simple-steps.png"
              alt="A diagram illustrating a four-step process for using the whistleblowing tool"
              className="h-full w-auto scale-x-[1.065] scale-y-[1.09] translate-y-0.5"
            />
          </div>
        </PageSection>
        <Separator solid />
        <PageSection height="h-32" />
        <Footer />
      </div>
    </div>
  );
}