export function NativeChatSessionOptionChoiceBody(props: {
  label: string
  description?: string
  badge?: string
}): React.JSX.Element {
  return (
    <div className="min-w-0 py-0.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate">{props.label}</span>
        {props.badge ? (
          <span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {props.badge}
          </span>
        ) : null}
      </div>
      {props.description ? (
        <div className="text-xs font-normal text-balance text-muted-foreground">
          {props.description}
        </div>
      ) : null}
    </div>
  )
}
