<script>
  /**
   * Searchable dropdown / combobox with optional grouping.
   * Props:
   *   items       – array of { id, label, group? }
   *   value       – bindable selected id (string)
   *   placeholder – input placeholder text
   *   id          – HTML id for the input
   */
  let {
    items = [],
    value = $bindable(''),
    placeholder = 'Search…',
    id = '',
    onchange = () => {},
  } = $props();

  let query = $state('');
  let open = $state(false);
  let highlightIdx = $state(-1);
  let activeGroup = $state(null);
  let inputEl = $state(null);
  let listEl = $state(null);

  // Displayed label when a value is selected and input is not focused
  let selectedLabel = $derived(items.find((i) => i.id === value)?.label ?? '');

  // Unique group names for the filter pills
  let allGroups = $derived([...new Set(items.map((i) => i.group).filter(Boolean))]);

  let filtered = $derived.by(() => {
    let base = items;
    if (activeGroup) {
      base = base.filter((i) => i.group === activeGroup);
    }
    if (query) {
      const q = query.toLowerCase();
      base = base.filter((i) =>
        i.label.toLowerCase().includes(q) || (i.group && i.group.toLowerCase().includes(q))
      );
    }
    return base;
  });

  // Build grouped structure: [{ group: string|null, items: [...] }, ...]
  let groupedFiltered = $derived.by(() => {
    const groups = [];
    let currentGroup = null;
    for (const item of filtered) {
      const g = item.group ?? null;
      if (g !== currentGroup) {
        groups.push({ group: g, items: [item] });
        currentGroup = g;
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  });

  // Flat index mapping for keyboard navigation (skips group headers)
  let flatFiltered = $derived(filtered);

  function selectItem(item) {
    value = item.id;
    query = '';
    activeGroup = null;
    open = false;
    highlightIdx = -1;
    onchange();
  }

  function clear() {
    value = '';
    query = '';
    activeGroup = null;
    open = false;
    highlightIdx = -1;
    onchange();
  }

  function onFocus() {
    open = true;
    query = '';
    highlightIdx = -1;
  }

  function onBlur(e) {
    // Delay to allow click on list item to register
    setTimeout(() => {
      open = false;
      query = '';
      activeGroup = null;
      highlightIdx = -1;
    }, 150);
  }

  function setGroup(g) {
    activeGroup = activeGroup === g ? null : g;
    highlightIdx = 0;
    // Re-focus input so the dropdown stays open
    inputEl?.focus();
  }

  function onInput() {
    open = true;
    highlightIdx = 0;
  }

  function onKeydown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        open = true;
        highlightIdx = 0;
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        highlightIdx = Math.min(highlightIdx + 1, flatFiltered.length - 1);
        scrollToHighlighted();
        break;
      case 'ArrowUp':
        e.preventDefault();
        highlightIdx = Math.max(highlightIdx - 1, 0);
        scrollToHighlighted();
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && highlightIdx < flatFiltered.length) {
          selectItem(flatFiltered[highlightIdx]);
          inputEl?.blur();
        }
        break;
      case 'Escape':
        open = false;
        query = '';
        highlightIdx = -1;
        inputEl?.blur();
        break;
    }
  }

  function scrollToHighlighted() {
    // Wait for DOM update
    requestAnimationFrame(() => {
      const el = listEl?.querySelector(`[data-idx="${highlightIdx}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    });
  }
</script>

<div class="search-select" role="combobox" aria-expanded={open} aria-controls="{id}-listbox" aria-haspopup="listbox">
  <input
    {id}
    type="text"
    autocomplete="off"
    {placeholder}
    bind:this={inputEl}
    bind:value={query}
    onfocus={onFocus}
    onblur={onBlur}
    oninput={onInput}
    onkeydown={onKeydown}
    aria-autocomplete="list"
  />
  {#if !open && value}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <span class="selected-display" onclick={() => inputEl?.focus()}>
      {selectedLabel}
    </span>
  {/if}
  {#if value && !open}
    <button class="clear-btn" onclick={clear} aria-label="Clear selection">&times;</button>
  {/if}

  {#if open}
    <div class="dropdown" id="{id}-listbox" bind:this={listEl}>
      {#if allGroups.length > 1}
        <div class="group-pills" role="tablist">
          {#each allGroups as g}
            <button
              class="group-pill"
              class:active={activeGroup === g}
              role="tab"
              aria-selected={activeGroup === g}
              onmousedown={(e) => { e.preventDefault(); setGroup(g); }}
            >{g}</button>
          {/each}
        </div>
      {/if}
      <ul class="options-list" role="listbox">
      {#if flatFiltered.length === 0}
        <li class="no-results">No matches</li>
      {:else}
        {#each groupedFiltered as group}
          {#if group.group}
            <li class="group-header">{group.group}</li>
          {/if}
          {#each group.items as item}
            {@const flatIdx = flatFiltered.indexOf(item)}
            <li
              role="option"
              aria-selected={item.id === value}
              data-idx={flatIdx}
              class:highlighted={flatIdx === highlightIdx}
              class:selected={item.id === value}
              onmousedown={() => selectItem(item)}
              onmouseenter={() => (highlightIdx = flatIdx)}
            >
              {item.label}
            </li>
          {/each}
        {/each}
      {/if}
      </ul>
    </div>
  {/if}
</div>

<style>
  .search-select {
    position: relative;
    min-width: 240px;
  }

  input {
    width: 100%;
    padding: 0.55rem 2rem 0.55rem 0.75rem;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    transition: border-color 0.15s;
  }

  input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .selected-display {
    position: absolute;
    top: 1px;
    left: 1px;
    right: 2rem;
    bottom: 1px;
    display: flex;
    align-items: center;
    padding: 0 0.75rem;
    font-size: inherit;
    pointer-events: none;
    color: var(--text);
    background: var(--bg);
    border-radius: calc(var(--radius-sm) - 1px);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .clear-btn {
    position: absolute;
    top: 50%;
    right: 0.5rem;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: var(--text);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    max-height: 280px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .group-pills {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem 0.6rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .group-pill {
    font-size: 0.72rem;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .group-pill:hover {
    border-color: var(--accent);
    color: var(--text);
  }

  .group-pill.active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 500;
  }

  .options-list {
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .options-list::-webkit-scrollbar {
    width: 6px;
  }

  .options-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .options-list::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }

  .options-list::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }

  .options-list li {
    padding: 0.45rem 0.75rem;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .options-list li.group-header {
    padding: 0.5rem 0.75rem 0.25rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    cursor: default;
    pointer-events: none;
  }

  .options-list li.group-header:not(:first-child) {
    margin-top: 0.25rem;
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
  }

  .options-list li.highlighted {
    background: var(--accent-dim);
  }

  .options-list li.selected {
    color: var(--accent);
  }

  .options-list li.no-results {
    color: var(--text-muted);
    font-style: italic;
    cursor: default;
  }

  @media (max-width: 600px) {
    .search-select {
      min-width: 0;
      width: 100%;
    }
  }
</style>
