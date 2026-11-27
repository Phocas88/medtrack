interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-heading break-words">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
