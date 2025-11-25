import type { ReactNode } from 'react';
import UsersDirectory from '../components/Admin/UsersDirectory';

export interface UsersPageProps {
  headerNav?: ReactNode;
}

export default function UsersPage({ headerNav = null }: UsersPageProps) {
  return <UsersDirectory variant="page" headerNav={headerNav} />;
}
