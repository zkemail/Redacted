'use client';

interface StepItemProps {
  title: string;
  steps: string[];
  isActive?: boolean;
}

export default function StepItem({ title, steps, isActive = false }: StepItemProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-[18px] items-center">
        <div
          className={`w-3 h-3 rounded-full ${
            isActive ? "bg-white" : "bg-[#374151]"
          }`}
        />
        <span
          className={`text-base font-medium ${
            isActive ? "text-white" : "text-[#9ca3af]"
          }`}
        >
          {title}
        </span>
      </div>
      
      <div className="flex gap-7 pl-5">
        <div className="flex items-center justify-center self-stretch">
          <div className="w-px h-full bg-[#374151]" />
        </div>
        
        <div className="flex flex-col gap-3 pb-3">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-1.5 items-center">
              <div className="w-3 h-px bg-[#374151]" />
              <span className="text-[#9ca3af] text-base font-medium">
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
