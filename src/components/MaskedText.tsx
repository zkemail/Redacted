import { useRef, useState } from 'react';
import { maskedSegments } from '../utils/maskedRuns';

interface MaskedTextProps {
  text: string;
  className?: string;
}

const Blocks = ({ count }: { count: number }) => (
  <span
    className="bg-black text-black select-none"
    style={{ letterSpacing: '0.05em', userSelect: 'none' }}
    aria-label={`${count} characters redacted`}
  >
    {'█'.repeat(count)}
  </span>
);

/** A long redacted stretch, collapsed to one row; click to show every block. */
function CollapsedRedaction({ content, hidden, lines }: { content: string; hidden: number; lines: number }) {
  const [open, setOpen] = useState(false);
  const restoreFocus = useRef(false);
  if (open) {
    return (
      <button
        type="button"
        onClick={() => {
          restoreFocus.current = true;
          setOpen(false);
        }}
        className="max-w-full cursor-pointer whitespace-pre-wrap break-all text-left"
        aria-label={`Collapse ${hidden.toLocaleString()} redacted characters`}
        aria-expanded={true}
        title="Collapse redacted characters"
      >
        {content.split(/(\0+)/).map((part, i) =>
          part.startsWith('\0') ? <Blocks key={i} count={part.length} /> : <span key={i}>{part}</span>
        )}
        <span className="ml-1 text-xs text-[#666] underline select-none">collapse</span>
      </button>
    );
  }
  return (
    <button
      ref={(node) => {
        if (node && restoreFocus.current) {
          restoreFocus.current = false;
          node.focus({ preventScroll: true });
        }
      }}
      type="button"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="my-1 flex w-full items-center gap-2 text-left text-xs text-[#666] select-none"
      title="Show every redacted character"
    >
      <span className="bg-black text-black" aria-hidden>
        {'█'.repeat(6)}
      </span>
      <span>
        ⋯ {hidden.toLocaleString()} redacted characters (~{lines.toLocaleString()} line{lines === 1 ? '' : 's'}) ⋯{' '}
        <span className="underline">show</span>
      </span>
    </button>
  );
}

/**
 * Text with null bytes (0x00, masked content from the ZK proof) rendered as black blocks.
 * Long redacted stretches are collapsed to one row (see utils/maskedRuns.ts).
 */
export default function MaskedText({ text, className = '' }: MaskedTextProps) {
  return (
    <span className={className}>
      {maskedSegments(text).map((segment, idx) => {
        if (segment.type === 'collapsed') return <CollapsedRedaction key={idx} {...segment} />;
        if (segment.type === 'masked') return <Blocks key={idx} count={segment.content.length} />;
        return <span key={idx}>{segment.content}</span>;
      })}
    </span>
  );
}
