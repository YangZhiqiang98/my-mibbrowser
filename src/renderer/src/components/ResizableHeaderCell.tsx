import React, { useCallback, useEffect, useRef, useState } from 'react'

const MIN_COLUMN_WIDTH = 60
const MAX_COLUMN_WIDTH = 600
const HANDLE_WIDTH = 6

export interface ResizableHeaderCellProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /**
   * Column key — required for drag-and-drop reordering so the parent table
   * can correlate the source <th> to a column in its ordering state. When
   * undefined (e.g. the static Instance column), the cell renders without
   * any drag/resize handles.
   */
  columnKey?: string
  /** Current width in pixels. When undefined, no resize handle is rendered. */
  width?: number
  /** Whether this header can be dragged to reorder columns. */
  draggable?: boolean
  onResize?: (key: string, newWidth: number) => void
  onColumnDragStart?: (key: string) => void
  onColumnDrop?: (sourceKey: string, targetKey: string) => void
}

/**
 * antd Table custom header cell with two hand-rolled affordances:
 *
 * 1. Right-edge mouse-drag resize. mousedown on the 6px handle starts a
 *    drag; mousemove updates the width via the controlled `width` prop +
 *    `onResize` callback; mouseup releases. Width is clamped to
 *    [MIN_COLUMN_WIDTH, MAX_COLUMN_WIDTH].
 * 2. HTML5 native drag-and-drop on the <th> element itself for column
 *    reordering. Source key goes through `dataTransfer`; we ignore drops
 *    onto self.
 *
 * Both features are opt-in: omit `width`/`onResize` to disable resize,
 * omit `draggable`/`columnKey` to disable reorder.
 */
export function ResizableHeaderCell({
  columnKey,
  width,
  draggable,
  onResize,
  onColumnDragStart,
  onColumnDrop,
  children,
  style,
  ...thProps
}: ResizableHeaderCellProps): React.ReactElement {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const [isResizing, setIsResizing] = useState(false)
  const [isDragTarget, setIsDragTarget] = useState(false)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!onResize || !columnKey) return
      const delta = e.clientX - startXRef.current
      const next = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, startWidthRef.current + delta)
      )
      onResize(columnKey, next)
    },
    [onResize, columnKey]
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (!isResizing) return
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!onResize || !columnKey || width === undefined) return
      e.preventDefault()
      e.stopPropagation()
      startXRef.current = e.clientX
      startWidthRef.current = width
      setIsResizing(true)
    },
    [onResize, columnKey, width]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLTableCellElement>) => {
      if (!columnKey || !draggable) return
      // Avoid hijacking resize: if the cursor started on the resize handle,
      // mousedown already preventDefault'd so dragstart shouldn't fire here.
      e.dataTransfer.setData('text/plain', columnKey)
      e.dataTransfer.effectAllowed = 'move'
      onColumnDragStart?.(columnKey)
    },
    [columnKey, draggable, onColumnDragStart]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLTableCellElement>) => {
    if (!columnKey || !draggable) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragTarget(true)
  }, [columnKey, draggable])

  const handleDragLeave = useCallback(() => {
    setIsDragTarget(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTableCellElement>) => {
      setIsDragTarget(false)
      if (!columnKey || !draggable) return
      e.preventDefault()
      const sourceKey = e.dataTransfer.getData('text/plain')
      if (!sourceKey || sourceKey === columnKey) return
      onColumnDrop?.(sourceKey, columnKey)
    },
    [columnKey, draggable, onColumnDrop]
  )

  const mergedStyle: React.CSSProperties = {
    ...style,
    position: 'relative',
    cursor: draggable ? 'grab' : style?.cursor,
    ...(isDragTarget ? { background: '#e6f7ff' } : null)
  }

  return (
    <th
      {...thProps}
      style={mergedStyle}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      onDragOver={draggable ? handleDragOver : undefined}
      onDragLeave={draggable ? handleDragLeave : undefined}
      onDrop={draggable ? handleDrop : undefined}
    >
      {children}
      {onResize && columnKey && width !== undefined && (
        <span
          className="results-col-resize-handle"
          onMouseDown={handleResizeMouseDown}
          // Suppress drag interactions so the resize gesture wins over the
          // column-reorder gesture when the user grabs the right edge.
          onDragStart={(e) => e.preventDefault()}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: HANDLE_WIDTH,
            cursor: 'col-resize',
            userSelect: 'none',
            zIndex: 1
          }}
        />
      )}
    </th>
  )
}
