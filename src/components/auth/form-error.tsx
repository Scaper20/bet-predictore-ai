export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-rose/30 bg-rose/10 p-3 text-xs text-rose">
      <svg className="mt-0.5 size-4 shrink-0 fill-current" viewBox="0 0 20 20" aria-hidden>
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
      </svg>
      <div className="flex-1 font-medium">{message}</div>
    </div>
  );
}
