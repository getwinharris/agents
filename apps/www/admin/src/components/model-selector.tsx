import { BrainCircuit, Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const models = ['GPT-5.6', 'GPT-5.6 mini', 'Claude Sonnet 4.6'] as const

export function ModelSelector() {
  const [model, setModel] = useState<(typeof models)[number]>('GPT-5.6')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 bg-background px-3 text-xs font-medium">
          <BrainCircuit className="size-4 text-indigo-600" />
          {model}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {models.map((item) => (
          <DropdownMenuItem key={item} onClick={() => setModel(item)} className="justify-between">
            {item}
            {item === model ? <Check className="size-4 text-indigo-600" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
