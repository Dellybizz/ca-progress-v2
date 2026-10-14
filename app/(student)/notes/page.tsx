import { redirect } from 'next/navigation';
import { resourceDestination } from '@/lib/resources/navigation';
export default async function NotesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  redirect(resourceDestination(await searchParams,'my'));
}
