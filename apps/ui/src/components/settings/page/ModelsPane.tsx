import type { Category } from '../registry/types';

export function ModelsPane({ category }: { category: Category }) {
  return (
    <div>
      <h2 id="settings-heading" tabIndex={-1} className="font-['Barlow_Condensed',sans-serif] text-[1.875rem] leading-[1.1] font-semibold outline-none">
        {category.label}
      </h2>
    </div>
  );
}
