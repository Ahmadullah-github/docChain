import { cx } from "../lib/classNames";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ alt = "DocChain logo", className, imageClassName }: BrandLogoProps) {
  return (
    <span
      className={cx(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-[#031b3a] shadow-sm ring-1 ring-black/10",
        className
      )}
    >
      <img
        alt={alt}
        className={cx("h-full w-full object-cover", imageClassName)}
        height="192"
        src="/brand/docchain-logo-192.png"
        srcSet="/brand/docchain-logo-192.png 192w, /brand/docchain-logo-512.png 512w"
        width="192"
      />
    </span>
  );
}
