import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Branch, EquipmentWithLive } from '../../types/models';

interface UseWorkspaceShortcutsParams {
  suspended: boolean;
  equipmentId?: string;
  branchId?: string;
  companyId?: string;
  isSingleBranchCompany: boolean;
  isGlobalAdmin: boolean;
  isRestrictedViewer: boolean;
  branchCount: number;
  branchEquipments: EquipmentWithLive[];
  companyBranches: Branch[];
  onStepEquipmentSibling: (delta: number) => void;
  navigate: NavigateFunction;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (EDITABLE_TAGS.has(target.tagName.toUpperCase())) return true;
  if (target.isContentEditable) return true;
  return (
    target.getAttribute('role') === 'combobox' ||
    target.getAttribute('aria-expanded') === 'true'
  );
}

function resolveEscapeDestination(params: {
  equipmentId?: string;
  branchId?: string;
  companyId?: string;
  isSingleBranchCompany: boolean;
  isGlobalAdmin: boolean;
  isRestrictedViewer: boolean;
  branchCount: number;
}): string | null {
  const {
    equipmentId,
    branchId,
    companyId,
    isSingleBranchCompany,
    isGlobalAdmin,
    isRestrictedViewer,
    branchCount,
  } = params;

  if (equipmentId && companyId) {
    if (isSingleBranchCompany) return `/operacao/empresas/${companyId}`;
    return branchId ? `/operacao/empresas/${companyId}/filiais/${branchId}` : null;
  }

  if (branchId && companyId) {
    if (isSingleBranchCompany) return isGlobalAdmin ? '/operacao' : null;
    if (isRestrictedViewer && branchCount <= 1) return null;
    return `/operacao/empresas/${companyId}`;
  }

  if (companyId && isGlobalAdmin) return '/operacao';
  return null;
}

function getSiblingDelta(key: string): number | null {
  const lower = key.toLowerCase();
  if (lower === 'j') return 1;
  if (lower === 'k') return -1;
  return null;
}

export function useWorkspaceShortcuts({
  suspended,
  equipmentId,
  branchId,
  companyId,
  isSingleBranchCompany,
  isGlobalAdmin,
  isRestrictedViewer,
  branchCount,
  branchEquipments,
  companyBranches,
  onStepEquipmentSibling,
  navigate,
}: UseWorkspaceShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || suspended || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableShortcutTarget(e.target)) return;

      if (e.key === 'Escape') {
        const destination = resolveEscapeDestination({
          equipmentId,
          branchId,
          companyId,
          isSingleBranchCompany,
          isGlobalAdmin,
          isRestrictedViewer,
          branchCount,
        });
        if (destination) {
          e.preventDefault();
          void navigate(destination);
        }
        return;
      }

      const delta = getSiblingDelta(e.key);
      if (delta === null) return;

      if (equipmentId && branchEquipments.length > 1) {
        e.preventDefault();
        onStepEquipmentSibling(delta);
        return;
      }

      if (!equipmentId && branchId && companyBranches.length > 1) {
        const idx = companyBranches.findIndex((b) => b.id === branchId);
        if (idx !== -1) {
          e.preventDefault();
          const nextBranch =
            companyBranches[(idx + delta + companyBranches.length) % companyBranches.length];
          if (!nextBranch) return;
          void navigate(`/operacao/empresas/${companyId}/filiais/${nextBranch.id}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    suspended,
    equipmentId,
    branchId,
    companyId,
    isSingleBranchCompany,
    isGlobalAdmin,
    isRestrictedViewer,
    branchCount,
    branchEquipments,
    companyBranches,
    onStepEquipmentSibling,
    navigate,
  ]);
}
