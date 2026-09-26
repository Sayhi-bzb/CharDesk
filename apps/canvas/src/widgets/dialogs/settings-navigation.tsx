import type { LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectableItem,
  Input,
} from '@chardesk/ui';


import type { SettingsSearchResult } from './settings-search';

type SettingsNavigationItem<Value extends string> = {
  value: Value;
  title: string;
  icon: LucideIcon;
};

type SettingsNavigationProps<Value extends string> = {
  label: string;
  items: readonly SettingsNavigationItem<Value>[];
  value: Value;
  onValueChange: (value: Value) => void;
  search: {
    label: string;
    placeholder: string;
    resultsLabel: string;
    noResultsLabel: string;
    query: string;
    results: readonly SettingsSearchResult[];
    onQueryChange: (query: string) => void;
    onResultSelect: (result: SettingsSearchResult) => void;
  };
};

export function SettingsNavigation<Value extends string>({
  label,
  items,
  value,
  onValueChange,
  search,
}: SettingsNavigationProps<Value>) {
  const resultsRef = useRef<HTMLElement>(null);
  const searching = search.query.trim().length > 0;
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      search.onQueryChange('');
      return;
    }
    const firstResult = search.results[0];
    if (!firstResult || (event.key !== 'ArrowDown' && event.key !== 'Enter')) return;
    event.preventDefault();
    if (event.key === 'Enter') {
      search.onResultSelect(firstResult);
      return;
    }
    resultsRef.current?.querySelector<HTMLElement>('[data-settings-search-result]')?.focus();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <div data-slot="settings-search" className="p-2 pb-1">
        <Input
          type="search"
          density="compact"
          appearance="search"
          value={search.query}
          aria-label={search.label}
          placeholder={search.placeholder}
          className="w-full"
          onChange={(event) => search.onQueryChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {searching ? (
        <nav
          ref={resultsRef}
          data-slot="settings-search-results"
          aria-label={search.resultsLabel}
          className="flex max-h-40 min-w-0 flex-col gap-1 overflow-auto p-2 pt-1 md:max-h-none md:min-h-0 md:flex-1"
        >
          {search.results.length > 0 ? (
            search.results.map((result, index) => (
              <div key={result.id} className="contents">
                {index === 0 || search.results[index - 1]?.group !== result.group ? (
                  <span className="px-2 pt-1 text-xs font-medium text-muted-foreground">
                    {result.groupTitle}
                  </span>
                ) : null}
                <SelectableItem
                  type="button"
                  data-settings-search-result=""
                  className="min-w-0 justify-start lg:w-full"
                  onClick={() => search.onResultSelect(result)}
                >
                  <span className="min-w-0 truncate text-left">{result.title}</span>
                </SelectableItem>
              </div>
            ))
          ) : (
            <p role="status" className="px-2 py-3 text-xs text-muted-foreground">
              {search.noResultsLabel}
            </p>
          )}
        </nav>
      ) : (
        <>
          <div data-slot="settings-navigation-mobile" className="p-2 md:hidden [&_svg]:size-[1em]!">
            <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as Value)}>
              <SelectTrigger className="w-full sm:w-44" aria-label={label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectGroup>
                  {items.map(({ icon: Icon, title, value: itemValue }) => (
                    <SelectItem key={itemValue} value={itemValue}>
                      <Icon />
                      {title}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div
            data-slot="settings-navigation-inline"
            className="hidden min-w-0 p-2 md:block [&_svg]:size-[1em]!"
          >
            <nav aria-label={label} className="flex min-w-0 flex-col gap-1 py-1">
              {items.map(({ icon: Icon, title, value: itemValue }) => (
                <SelectableItem
                  key={itemValue}
                  type="button"
                  selected={value === itemValue}
                  aria-current={value === itemValue ? 'page' : undefined}
                  className="w-full min-w-0 justify-start [&_svg]:shrink-0"
                  onClick={() => onValueChange(itemValue)}
                >
                  <Icon />
                  <span className="truncate">{title}</span>
                </SelectableItem>
              ))}
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
