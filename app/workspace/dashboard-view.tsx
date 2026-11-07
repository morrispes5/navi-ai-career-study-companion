"use client";

import { Briefcase, Flame, Target } from "lucide-react";
import Link from "next/link";
import { formatStudyTime } from "../../lib/engagement/dates";
import type { DashboardData } from "../../lib/db/navi";

export function DashboardView({ data }: { data: DashboardData }) {
  const percent = data.plan.totalTasks ? Math.round((data.plan.completedTasks / data.plan.totalTasks) * 100) : 0;
  const streakNote = data.progress.currentStreak > 0 ? `Terakhir aktif ${data.progress.lastActiveDate}` : "Selesaikan satu tugas atau chat dengan Navi untuk mulai streak.";
  return <><header className="content-head"><div><p className="eyebrow"><span /> Progresmu</p><h1>Belajar yang sudah bergerak.</h1><p>Angka ini hanya milik akunmu: jam latihan, streak, rencana, dan lamaran.</p></div><Link className="secondary-button" href="/workspace/profile">Atur pengingat</Link></header><div className="progress-grid"><article><small><Flame size={14} /> Streak</small><b>{data.progress.currentStreak} hari</b><span>Terpanjang {data.progress.longestStreak} hari. {streakNote}</span></article><article><small><Target size={14} /> Rencana aktif</small><b>{percent}%</b><span>{data.plan.completedTasks} dari {data.plan.totalTasks} tugas di {data.plan.title}</span><i><em style={{ width: `${percent}%` }} /></i></article><article><small>Jam belajar</small><b>{formatStudyTime(data.progress.studyMinutes)}</b><span>Dari tugas yang sudah kamu selesaikan.</span></article><article><small><Briefcase size={14} /> Lamaran</small><b>{data.progress.applicationCount}</b><span>Tersimpan di pelacak lamaranmu.</span></article></div><div className="today-links"><Link href="/workspace/plan">Lihat rencana</Link><Link href="/workspace/jobs">Kelola lamaran</Link></div></>;
}
