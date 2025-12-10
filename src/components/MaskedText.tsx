interface MaskedTextProps {
  text: string;
  className?: string;
}

/**
 * Component that displays text with null bytes rendered as black blocks
 *
 * Null bytes (0x00) in the text are displayed as black rectangles,
 * representing masked/redacted content from the ZK proof.
 */
export default function MaskedText({ text, className = '' }: MaskedTextProps) {
  // Split text into segments: regular text and null byte sequences
  const segments: { type: 'text' | 'masked'; content: string }[] = [];
  let currentSegment = '';
  let inMaskedSection = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isNull = char === '\x00';

    if (isNull !== inMaskedSection) {
      // Transition between masked and unmasked
      if (currentSegment) {
        segments.push({
          type: inMaskedSection ? 'masked' : 'text',
          content: currentSegment,
        });
      }
      currentSegment = char;
      inMaskedSection = isNull;
    } else {
      currentSegment += char;
    }
  }

  // Push final segment
  if (currentSegment) {
    segments.push({
      type: inMaskedSection ? 'masked' : 'text',
      content: currentSegment,
    });
  }

  return (
    <span className={className}>
      {segments.map((segment, idx) => {
        if (segment.type === 'masked') {
          // Render black blocks for masked content
          // Each null byte becomes one block character
          return (
            <span
              key={idx}
              className="bg-black text-black select-none"
              style={{
                letterSpacing: '0.05em',
                userSelect: 'none',
              }}
              aria-label={`${segment.content.length} characters redacted`}
            >
              {'\u2588'.repeat(segment.content.length)}
            </span>
          );
        }
        return <span key={idx}>{segment.content}</span>;
      })}
    </span>
  );
}
