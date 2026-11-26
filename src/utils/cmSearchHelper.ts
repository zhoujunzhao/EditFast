import type { EditorView } from 'codemirror'
import {
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll
} from '@codemirror/search'

export interface SearchOptions {
  search: string
  replace: string
  caseSensitive: boolean
  wholeWord: boolean
  regexp: boolean
}

export function syncCmSearchQuery(
  view: EditorView | null,
  opts: SearchOptions
): { current: number; total: number } {
  if (!view) return { current: 0, total: 0 }

  const query = new SearchQuery({
    search: opts.search,
    replace: opts.replace,
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord,
    regexp: opts.regexp
  })

  view.dispatch({ effects: setSearchQuery.of(query) })

  if (!opts.search || !query.valid) {
    return { current: 0, total: 0 }
  }

  let total = 0
  let current = 0
  const selFrom = view.state.selection.main.from
  const cursor = query.getCursor(view.state)

  for (let item = cursor.next(); !item.done; item = cursor.next()) {
    total++
    if (item.value.from <= selFrom) {
      current = total
    }
    if (total >= 10000) break
  }

  return { current, total }
}

export function cmFindNext(view: EditorView | null, opts: SearchOptions) {
  if (!view) return { current: 0, total: 0 }
  syncCmSearchQuery(view, opts)
  findNext(view)
  return syncCmSearchQuery(view, opts)
}

export function cmFindPrev(view: EditorView | null, opts: SearchOptions) {
  if (!view) return { current: 0, total: 0 }
  syncCmSearchQuery(view, opts)
  findPrevious(view)
  return syncCmSearchQuery(view, opts)
}

export function cmReplaceOne(view: EditorView | null, opts: SearchOptions) {
  if (!view) return { current: 0, total: 0 }
  syncCmSearchQuery(view, opts)
  replaceNext(view)
  return syncCmSearchQuery(view, opts)
}

export function cmReplaceAll(view: EditorView | null, opts: SearchOptions) {
  if (!view) return { current: 0, total: 0 }
  syncCmSearchQuery(view, opts)
  replaceAll(view)
  return syncCmSearchQuery(view, opts)
}

export function cmClearSearch(view: EditorView | null) {
  if (!view) return
  view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '' })) })
}
