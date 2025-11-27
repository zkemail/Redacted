'use client';

export default function UploadSection() {
  return (
    <div className="flex flex-col items-center gap-6 md:gap-9 px-4 md:px-0">
      <div className="flex flex-col items-center gap-6 md:gap-8">
        <div className="h-[300px] md:h-[383px] w-full max-w-[544px] relative">
          {/* Email Preview Card */}
          <div className="absolute left-4 md:left-[61px] top-[-8px] md:top-[-16px] w-[calc(100%-2rem)] md:w-[422px] h-[280px] md:h-[360px] bg-[#0f1112] rounded-[10px] shadow-lg">
            <div className="p-3 md:p-4 text-[#fbfdfe] text-[7px] md:text-[8.5px] leading-[10px] md:leading-[12px]">
              <p className="mb-1">
                <span className="font-bold">From</span>: ceo@evilpenguins.org
              </p>
              <p className="mb-1">
                <span className="font-bold">To</span>: developers@evilpenguins.org
              </p>
              <p className="mb-1">&nbsp;</p>
              <p className="mb-1">
                <span className="font-bold">Subject</span>: Reject Antarctica, Mass Attack Humans
              </p>
              <p className="mb-1">&nbsp;</p>
              <p className="mb-1">Here's the plan:</p>
              <ol className="list-decimal ml-3">
                <li className="mb-1">
                  <span className="font-bold">Infiltrate their cities:</span>
                  We'll start with a coordinated march into their most populated areas. Don't be shy—let them hear those flippers slap the ground with authority.
                </li>
                <li className="mb-1">
                  <span className="font-bold">Disrupt their routines:</span>
                  Knock over a few trash cans, peck at their shoes, maybe even commandeer a few shopping carts for fun. Let's show them that chaos comes in black and white.
                </li>
                <li>
                  <span className="font-bold">Make our demands known:</span>
                  We want colder climates, more fish, and an immediate stop to all those ridiculous documentaries making us look cute and harmless. We're dignified, not adorable!
                </li>
              </ol>
            </div>
          </div>
          
          {/* Decorative elements - hidden on mobile */}
          <div className="hidden md:block absolute -left-[91px] -top-[173px] w-[509px] h-[509px] bg-gradient-to-br from-[#5e6ad2]/20 to-transparent rounded-full blur-3xl" />
          <div className="hidden md:block absolute left-[1066px] top-[273px] w-[509px] h-[509px] bg-gradient-to-br from-[#5e6ad2]/20 to-transparent rounded-full blur-3xl" />
        </div>
        
        <div className="flex flex-col items-center gap-3 md:gap-4 text-center px-4">
          <h2 className="text-[#fbfdfe] text-lg md:text-2xl font-normal leading-6 md:leading-7 w-full max-w-[544px]">
            Prove any contents for any email, sent or received
          </h2>
          <p className="text-[#9ca3af] text-sm md:text-base font-normal leading-4 md:leading-5 w-full max-w-[536px]">
            Prove only what content you want from an email. Hide what you don't want known, also prove who sent the email
          </p>
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-3 md:gap-4 w-full max-w-[544px] px-4">
        <button className="bg-[#5e6ad2] flex items-center gap-2 md:gap-3 px-3 py-2 md:py-2.5 rounded-lg w-full max-w-[240px]">
          <div className="w-4 h-4 md:w-5 md:h-5">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2L3 7v11h14V7l-7-5z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M10 8v8M6 12h8" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="text-white text-sm md:text-base font-medium">
            Upload .eml file
          </span>
        </button>
        
        <div className="flex items-center gap-3 md:gap-4 w-full">
          <div className="flex-1 h-px bg-[#374151]" />
          <span className="text-[#9ca3af] text-sm md:text-base font-light">
            OR
          </span>
          <div className="flex-1 h-px bg-[#374151]" />
        </div>
        
        <button className="bg-[#26272e] border border-[#2d2f31] flex items-center justify-center px-3 py-2 md:py-2.5 rounded-lg w-full max-w-[240px]">
          <span className="text-white text-sm md:text-base font-medium">
            Try our demo file
          </span>
        </button>
      </div>
    </div>
  );
}
