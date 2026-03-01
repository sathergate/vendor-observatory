import Link from "next/link";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-[12px] text-secondary mb-4"
    >
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="text-muted select-none">
              /
            </span>
          )}
          {item.href ? (
            <Link
              href={item.href}
              className="hover:text-accent transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-primary">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
