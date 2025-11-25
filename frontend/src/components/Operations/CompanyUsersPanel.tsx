import type { Branch } from '../../types/models';
import UsersDirectory from '../Admin/UsersDirectory';

export interface CompanyUsersPanelProps {
  companyId?: string | null;
  branches?: Branch[];
}

export default function CompanyUsersPanel({
  companyId,
  branches = [],
}: CompanyUsersPanelProps) {
  return (
    <UsersDirectory
      variant="card"
      scopedCompanyId={companyId}
      scopedBranches={branches}
    />
  );
}
