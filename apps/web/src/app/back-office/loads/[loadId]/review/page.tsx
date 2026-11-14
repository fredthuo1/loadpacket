"use client";
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DocumentReview } from '@/components/document-review';
import { ManagementPage } from '@/components/management-ui';
const refreshParent=async()=>{};
export default function ReviewPage(){
  const {loadId}=useParams<{loadId:string}>();
  return <ManagementPage title="Load Paperwork" description="Review received documents and record exceptions."><Link href="/back-office" className="mb-5 inline-block text-blue-700">Back to Back Office</Link><DocumentReview loadId={loadId} onChange={refreshParent}/></ManagementPage>;
}
