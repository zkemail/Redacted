'use client';

import StepItem from './StepItem';

export default function HowItWorks() {
  const steps = [
    {
      title: "UPLOAD .EML FILE",
      steps: [
        "Download .eml from your email client",
        "Upload the file to edit mail"
      ]
    },
    {
      title: "SELECT TEXT TO HIDE",
      steps: [
        "Use our eraser to hide any content",
        "Select multiple parts if needed"
      ]
    },
    {
      title: "RECLICK TO SHOW AGAIN",
      steps: [
        "Click on any erased part to show again",
        "Repeat it until satisfied"
      ]
    },
    {
      title: "GENERATE PROOF",
      steps: [
        "Generate proof for the masked mail",
        "Wait few minutes for generation"
      ]
    },
    {
      title: "DOWNLOAD MAIL",
      steps: [
        "Download mail with hidden contents"
      ]
    },
    {
      title: "SHARE VERIFICATION LINK",
      steps: [
        "Proves the authenticity of the mail",
        "Anyone can verify through this link"
      ]
    }
  ];

  return (
    <div className="bg-[#141517] border border-[#222325] rounded-3xl p-4 md:p-6 h-full w-full max-w-[400px]">
      <div className="flex items-center justify-center mb-3 md:mb-4">
        <h2 className="text-white text-sm md:text-base font-bold">
          How this works?
        </h2>
      </div>
      
      <div className="h-px bg-[#374151] mb-3 md:mb-4" />
      
      <div className="flex flex-col gap-2 md:gap-3">
        {steps.map((step, index) => (
          <StepItem
            key={index}
            title={step.title}
            steps={step.steps}
          />
        ))}
      </div>
    </div>
  );
}
