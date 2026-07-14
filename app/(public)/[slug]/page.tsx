import { notFound } from "next/navigation";
import { getPublicBarbershopData } from "@/lib/data/public-page";
import { initials } from "@/lib/format";
import { todayBrazilDateString } from "@/lib/timezone";
import { BookingClient } from "./booking-client";
import styles from "./public.module.css";

export default async function PublicBarbershopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const bookingDate = todayBrazilDateString();
  const data = await getPublicBarbershopData(slug, bookingDate);
  if (!data) notFound();

  const { barbershop, services, reviews, ratingAvg, ratingCount, availableSlots, staff } = data;

  return (
    <div className={styles.page}>
      <div
        className={styles.banner}
        style={barbershop.bannerUrl ? { backgroundImage: `url(${barbershop.bannerUrl})` } : undefined}
      />

      <div className={styles.headerWrap}>
        <div
          className={styles.avatar}
          style={barbershop.avatarUrl ? { backgroundImage: `url(${barbershop.avatarUrl})` } : undefined}
        >
          {!barbershop.avatarUrl && initials(barbershop.name)}
        </div>
        <h1 className={styles.name}>{barbershop.name}</h1>
        <div className={styles.metaLine}>
          {ratingAvg !== null && (
            <>★ {ratingAvg.toFixed(1).replace(".", ",")} ({ratingCount}) · </>
          )}
          {barbershop.address ?? "Endereço não informado"}
        </div>

        {(barbershop.instagramUrl || barbershop.whatsappUrl) && (
          <div className={styles.socialRow}>
            {barbershop.instagramUrl && (
              <a href={barbershop.instagramUrl} target="_blank" className={styles.socialBtnDark}>
                Instagram
              </a>
            )}
            {barbershop.whatsappUrl && (
              <a href={barbershop.whatsappUrl} target="_blank" className={styles.socialBtnLight}>
                WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      {barbershop.description && <p className={styles.description}>{barbershop.description}</p>}

      <BookingClient
        slug={slug}
        bookingDate={bookingDate}
        services={services}
        availableSlots={availableSlots ?? []}
        initialReviews={reviews}
        initialRatingAvg={ratingAvg}
        initialRatingCount={ratingCount}
        staffList={staff}
        showStaffPicker={barbershop.mode === "DONO" && staff.length > 1}
      />

      <div style={{ height: 32 }} />
    </div>
  );
}
