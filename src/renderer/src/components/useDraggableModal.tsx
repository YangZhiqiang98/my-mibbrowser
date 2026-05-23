import React, { useCallback, useEffect, useRef, useState } from 'react'

interface DragStart {
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
}

interface UseDraggableModalApi {
  titleProps: {
    onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void
  }
  modalRender: (modal: React.ReactNode) => React.ReactNode
}

/**
 * Lightweight draggable wrapper for Ant Design Modal.
 *
 * AntD does not provide built-in dragging. We keep the implementation local
 * and dependency-free: the title bar starts a document-level mouse drag, and
 * `modalRender` applies the resulting translate to the rendered modal node.
 */
export function useDraggableModal(open: boolean): UseDraggableModalApi {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStartRef = useRef<DragStart | null>(null)
  const modalRootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 })
  }, [open])

  const startDrag = useCallback((event: MouseEvent | React.MouseEvent) => {
    if (event.button !== 0) return
    const target = event.target
    if (
      target instanceof Element &&
      (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea') || target.closest('[role="button"]'))
    ) {
      return
    }
    dragStartRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y
    }
    document.body.style.userSelect = 'none'
  }, [offset.x, offset.y])

  useEffect(() => {
    if (!open) return
    const header = modalRootRef.current?.querySelector('.ant-modal-header')
    if (!(header instanceof HTMLElement)) return

    header.classList.add('non-modal-dialog-drag-region')
    header.addEventListener('mousedown', startDrag)
    return () => {
      header.removeEventListener('mousedown', startDrag)
      header.classList.remove('non-modal-dialog-drag-region')
    }
  }, [open, startDrag])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent): void => {
      const dragStart = dragStartRef.current
      if (!dragStart) return
      setOffset({
        x: dragStart.offsetX + event.clientX - dragStart.pointerX,
        y: dragStart.offsetY + event.clientY - dragStart.pointerY
      })
    }

    const handleMouseUp = (): void => {
      dragStartRef.current = null
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
    }
  }, [])

  const handleTitleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    startDrag(event)
  }, [startDrag])

  const modalRender = useCallback((modal: React.ReactNode): React.ReactNode => (
    <div
      ref={modalRootRef}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: dragStartRef.current ? 'none' : undefined
      }}
    >
      {modal}
    </div>
  ), [offset.x, offset.y])

  return {
    titleProps: { onMouseDown: handleTitleMouseDown },
    modalRender
  }
}
