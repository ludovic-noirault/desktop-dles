import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";

type IconButtonProps = {
  label: string;
  icon: LucideIcon;
  ref?: Ref<HTMLButtonElement>;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label" | "title"
>;

export function IconButton({ label, icon: Icon, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} title={label} {...rest}>
      <Icon aria-hidden="true" size={16} />
    </button>
  );
}
