"use client";

import { createContext, useContext } from "react";
import type { StudentContextContract } from "@/lib/academic/student-context";

const StudentContext = createContext<StudentContextContract | null>(null);

export function StudentContextProvider({ value, children }: { value: StudentContextContract; children: React.ReactNode }) {
  return <StudentContext.Provider value={value}>{children}</StudentContext.Provider>;
}

export function useStudentContext() {
  const value = useContext(StudentContext);
  if (!value) throw new Error("useStudentContext must be used inside the student workspace.");
  return value;
}
