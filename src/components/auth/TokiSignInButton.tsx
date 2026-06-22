interface Props {
  /** Path to return the user to after successful Toki login. Defaults to current URL. */
  redirect?: string;
  className?: string;
  /** Optional label override. Default: "Toki-р нэвтрэх" */
  label?: string;
}

/**
 * "Sign in with Toki" button, styled per official Toki Sign in Guidelines:
 * Fill #ffdd00, text #000000, Toki rounded-square mark on the left.
 */
export function TokiSignInButton({ redirect, className, label = "Toki-р нэвтрэх" }: Props) {
  const onClick = () => {
    const r =
      redirect ??
      (typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : "/");
    window.location.href = `/auth/toki/login?redirect=${encodeURIComponent(r)}`;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toki-р нэвтрэх"
      className={
        "flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffdd00] px-4 text-sm font-semibold text-black shadow-sm transition hover:brightness-95 active:brightness-90 " +
        (className ?? "")
      }
    >
      <TokiMark className="h-6 w-6" />
      <span>{label}</span>
    </button>
  );
}

function TokiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11" fill="#ffdd00" stroke="#000" strokeOpacity="0.08" />
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="ui-sans-serif, system-ui, -apple-system, 'Geologica', sans-serif"
        fontSize="13"
        fontWeight="700"
        fill="#000"
      >
        Toki
      </text>
    </svg>
  );
}
