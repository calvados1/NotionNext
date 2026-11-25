import { useMemo, useState } from 'react'
import SmartLink from '@/components/SmartLink'

export function buildNoteTree(root, entries) {
  const tree = []
  for (const entry of entries) {
    const parts = entry.path.split('/').map(p => p.trim()).filter(Boolean)
    if (parts.shift() !== root) continue
    let children = tree
    let key = root
    parts.forEach((name, i) => {
      key += '/' + name
      let node = children.find(n => n.name === name)
      if (!node) {
        node = { key, name, children: [], sort: entry.sort || 0 }
        children.push(node)
      }
      node.sort = Math.min(node.sort, entry.sort || 0)
      if (i === parts.length - 1) node.href = entry.href
      children = node.children
    })
  }
  function order(nodes) {
    nodes.sort((a,b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN', { numeric: true }))
    nodes.forEach(n => order(n.children))
    return nodes
  }
  return order(tree)
}

function TreeNode({ node, depth, expanded, toggle }) {
  const branch = node.children.length > 0
  const open = !!expanded[node.key]
  const label = node.href ? (
    <SmartLink href={node.href} className="min-w-0 flex-1 break-words py-2 text-[var(--endspace-text-primary)] hover:underline" prefetch={false}>
      {node.name}
    </SmartLink>
  ) : (
    <button type="button" onClick={() => toggle(node.key)} className="min-w-0 flex-1 break-words py-2 text-left font-medium text-[var(--endspace-text-primary)]">
      {node.name}
    </button>
  )
  return (
    <li className="list-none">
      <div className={`flex items-start gap-2 px-2 hover:bg-[var(--endspace-bg-secondary)] ${depth === 0 ? 'bg-[var(--endspace-bg-secondary)] font-medium' : ''}`}>
        {branch ? (
          <button type="button" onClick={() => toggle(node.key)} aria-expanded={open} aria-label={(open ? '折叠 ' : '展开 ') + node.name} className="w-7 h-9 shrink-0 flex items-center justify-center text-[var(--endspace-text-secondary)]">
            <span aria-hidden="true" className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          </button>
        ) : (
          <span aria-hidden="true" className="w-7 h-9 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-[var(--endspace-text-muted)]" /></span>
        )}
        {label}
      </div>
      {branch && open && (
        <ul className="ml-3 sm:ml-5 pl-1 border-l border-[var(--endspace-border-base)]">
          {node.children.map(child => <TreeNode key={child.key} node={child} depth={depth+1} expanded={expanded} toggle={toggle} />)}
        </ul>
      )}
    </li>
  )
}

export default function NoteTree({ root, title, entries }) {
  const nodes = useMemo(() => buildNoteTree(root, entries), [root, entries])
  const [expanded, setExpanded] = useState({})
  const toggle = key => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  return (
    <section className="w-full text-[var(--endspace-text-primary)]">
      <div className="mb-6">
        <div className="text-xs text-[var(--endspace-text-muted)] mb-3">技术笔记 / {root}</div>
        <h1 className="text-3xl md:text-4xl font-black mb-3">{title || `${root} 学习笔记`}</h1>
        <div className="flex justify-between text-xs text-[var(--endspace-text-muted)] tracking-wider"><span>KNOWLEDGE INDEX</span><span>{entries.length} ARTICLES</span></div>
      </div>
      <div className="border border-[var(--endspace-border-base)] bg-[var(--endspace-bg-base)] p-3 md:p-5">
        <div className="flex items-center justify-between mb-4 gap-2">
          <h2 className="border-l-4 border-[#FBFB46] pl-3 font-bold">笔记目录</h2>
          <button type="button" className="text-xs py-2 text-[var(--endspace-text-secondary)]" onClick={() => setExpanded({})}>全部折叠</button>
        </div>
        <ul className="space-y-2 text-sm">{nodes.map(node => <TreeNode key={node.key} node={node} depth={0} expanded={expanded} toggle={toggle} />)}</ul>
      </div>
    </section>
  )
}
