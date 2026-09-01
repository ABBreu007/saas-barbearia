"use client";

import { useState } from "react";
import { formatCentsBRL } from "@/lib/format";
import styles from "./produtos.module.css";

type Product = {
  id: string;
  name: string;
  priceCents: number;
  stockQty: number | null;
  active: boolean;
};

const PRICE_STEP = 500; // R$5, em centavos

export function ProductsList({ initialProducts }: { initialProducts: Product[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editName, setEditName] = useState("");
  const [editStock, setEditStock] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditPrice(p.priceCents);
    setEditName(p.name);
    setEditStock(p.stockQty ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        priceCents: editPrice,
        name: editName,
        stockQty: editStock === "" ? null : editStock,
      }),
    });
    if (res.ok) {
      const { product } = await res.json();
      setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
    }
    setEditingId(null);
  }

  async function remove(id: string) {
    setListError(null);
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setListError("Não foi possível remover o produto.");
      return;
    }
    const body = await res.json();
    if (body.deactivated) {
      setProducts((prev) => prev.map((p) => (p.id === id ? body.product : p)));
      setListError(
        "Esse produto já foi vendido em alguma comanda, então foi desativado em vez de removido — some da lista de venda, mas o histórico continua íntegro."
      );
      return;
    }
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }

  async function reactivate(id: string) {
    setListError(null);
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    if (!res.ok) {
      setListError("Não foi possível reativar o produto.");
      return;
    }
    const { product } = await res.json();
    setProducts((prev) => prev.map((p) => (p.id === id ? product : p)));
  }

  return (
    <div>
      <div className={styles.hint}>Toque em &quot;Editar&quot; para mudar o preço</div>
      {listError && <div className={styles.formError}>{listError}</div>}

      {products.length === 0 && !creating ? (
        <div className={styles.empty}>
          Nenhum produto cadastrado ainda — crie o primeiro pra começar a vender na comanda.
        </div>
      ) : (
        <div className={styles.tableHeader}>
          <span>Produto</span>
          <span>Estoque</span>
          <span>Preço</span>
          <span>Ações</span>
        </div>
      )}

      <div className={styles.list}>
        {products.map((p) =>
          editingId === p.id ? (
            <div key={p.id} className={styles.cardEditing}>
              <div className={styles.cardEditingHeader}>
                <span className={styles.badge}>EDITANDO</span>
              </div>
              <div className={styles.fieldRow}>
                <div className={styles.field}>
                  <label className={styles.label}>Nome</label>
                  <input
                    className={styles.input}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className={styles.field} style={{ maxWidth: 110 }}>
                  <label className={styles.label}>Estoque</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className={styles.input}
                    placeholder="—"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </div>
              </div>
              <div className={styles.stepperRow}>
                <button
                  type="button"
                  className={styles.stepperBtn}
                  onClick={() => setEditPrice((p) => Math.max(0, p - PRICE_STEP))}
                >
                  −
                </button>
                <div className={styles.stepperValue}>{formatCentsBRL(editPrice)}</div>
                <button
                  type="button"
                  className={styles.stepperBtnAccent}
                  onClick={() => setEditPrice((p) => p + PRICE_STEP)}
                >
                  +
                </button>
              </div>
              <div className={styles.editActions}>
                <button type="button" className={styles.cancelBtn} onClick={cancelEdit}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={() => saveEdit(p.id)}
                  disabled={!editName.trim()}
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <div key={p.id} className={styles.card} data-inactive={!p.active}>
              <div className={styles.cardMain}>
                <div className={styles.cardName}>
                  {p.name}
                  {!p.active && <span className={styles.inactiveBadge}>INATIVO</span>}
                </div>
                <div className={styles.cardDuration}>
                  {p.stockQty === null ? "estoque não controlado" : `${p.stockQty} em estoque`}
                </div>
              </div>
              <div className={styles.cardActions}>
                <div className={styles.cardPrice}>{formatCentsBRL(p.priceCents)}</div>
                <button type="button" className={styles.editLink} onClick={() => startEdit(p)}>
                  Editar
                </button>
                {p.active ? (
                  <button
                    type="button"
                    className={styles.removeLink}
                    onClick={() => remove(p.id)}
                    aria-label={`Remover ${p.name}`}
                  >
                    ✕
                  </button>
                ) : (
                  <button type="button" className={styles.editLink} onClick={() => reactivate(p.id)}>
                    Reativar
                  </button>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {creating ? (
        <NewProductForm
          onCancel={() => setCreating(false)}
          onCreated={(product) => {
            setProducts((prev) => [...prev, product]);
            setCreating(false);
          }}
        />
      ) : (
        <button type="button" className={styles.newButton} onClick={() => setCreating(true)}>
          + Novo produto
        </button>
      )}
    </div>
  );
}

function NewProductForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (product: Product) => void;
}) {
  const [name, setName] = useState("");
  const [priceReais, setPriceReais] = useState(30);
  const [stockQty, setStockQty] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        priceCents: Math.round(priceReais * 100),
        ...(stockQty === "" ? {} : { stockQty }),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Não foi possível criar o produto.");
      return;
    }
    const { product } = await res.json();
    onCreated(product);
  }

  return (
    <form className={styles.newForm} onSubmit={handleSubmit}>
      {error && <div className={styles.formError}>{error}</div>}
      <div className={styles.field}>
        <label className={styles.label}>Nome</label>
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label}>Estoque (opcional)</label>
          <input
            type="number"
            min={0}
            step={1}
            className={styles.input}
            placeholder="não controlar"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Preço (R$)</label>
          <input
            type="number"
            min={0}
            step={5}
            className={styles.input}
            value={priceReais}
            onChange={(e) => setPriceReais(Number(e.target.value))}
            required
          />
        </div>
      </div>
      <div className={styles.editActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={styles.saveBtn} disabled={loading}>
          {loading ? "Criando..." : "Criar produto"}
        </button>
      </div>
    </form>
  );
}
