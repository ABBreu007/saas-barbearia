import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProductsList } from "./products-list";
import styles from "./produtos.module.css";

export default async function ProdutosPage() {
  const staff = await requireStaff();
  if (!staff) return null; // layout já redireciona

  const products = await prisma.product.findMany({
    where: { barbershopId: staff.barbershopId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Produtos</h1>
      <ProductsList initialProducts={products} />
      <div style={{ height: 24 }} />
    </div>
  );
}
