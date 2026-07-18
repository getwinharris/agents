import type { BapxConversationPart } from '@bapX/react'
import { FileText } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import {
  Attachment,
  AttachmentContent,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { describeToolCall } from './tool-display'
import { useSmoothedText } from './use-smoothed-text'

function StreamingCaret() {
  return (
    <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-foreground align-middle" />
  )
}

function TextPart({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useSmoothedText(text, streaming)
  return (
    <div className="py-1 text-sm">
      <MessageResponse isAnimating={streaming}>{shown}</MessageResponse>
      {streaming || shown.length < text.length ? <StreamingCaret /> : null}
    </div>
  )
}

/**
 * Rendered only when "show thinking" is on. Streams the live reasoning text
 * (kept open so it's visible as it arrives); once done it stays as a collapsible
 * "Reasoning" disclosure.
 */
function ReasoningPart({ text, streaming }: { text: string; streaming: boolean }) {
  const shown = useSmoothedText(text, streaming)
  return (
    <Reasoning isStreaming={streaming} className="my-1">
      <ReasoningTrigger />
      <ReasoningContent>{shown}</ReasoningContent>
    </Reasoning>
  )
}

function FilePart({ part }: { part: Extract<BapxConversationPart, { type: 'file' }> }) {
  // The SDK fills `url` in (a hosted URL for recorded attachments, a `data:` URL
  // for the optimistic echo); render it directly when present.
  const title = part.filename ?? part.mediaType

  if (part.url && part.mediaType.startsWith('image/')) {
    return (
      <img
        src={part.url}
        alt={title}
        className="my-1.5 max-h-64 w-fit rounded-lg border border-border object-contain"
      />
    )
  }

  return (
    <Attachment className="my-1.5 w-fit">
      <AttachmentMedia>
        <FileText className="size-4 text-muted-foreground" />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>
          {part.url ? (
            <a href={part.url} target="_blank" rel="noreferrer" className="hover:underline">
              {title}
            </a>
          ) : (
            title
          )}
        </AttachmentTitle>
      </AttachmentContent>
    </Attachment>
  )
}

function ToolPart({ part }: { part: Extract<BapxConversationPart, { type: 'dynamic-tool' }> }) {
  const { summary } = describeToolCall(part)
  return (
    <Tool className="my-1.5">
      <ToolHeader type="dynamic-tool" toolName={part.toolName} state={part.state} title={summary} />
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput
          output={part.state === 'output-available' ? part.output : undefined}
          errorText={part.state === 'output-error' ? part.errorText : undefined}
        />
      </ToolContent>
    </Tool>
  )
}

export function MessagePart({ part }: { part: BapxConversationPart }) {
  switch (part.type) {
    case 'text':
      return <TextPart text={part.text} streaming={part.state === 'streaming'} />
    case 'reasoning':
      return <ReasoningPart text={part.text} streaming={part.state === 'streaming'} />
    case 'file':
      return <FilePart part={part} />
    case 'dynamic-tool':
      return <ToolPart part={part} />
    default:
      return null
  }
}
