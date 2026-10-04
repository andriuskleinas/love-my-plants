import type { Metadata } from "next";
import { RegisterFlow } from "./register-flow";

export const metadata: Metadata = { title: "Add a plant · Love My Plants" };

export default function NewPlantPage() {
  return <RegisterFlow />;
}
