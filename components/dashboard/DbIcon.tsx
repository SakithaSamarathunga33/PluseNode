import Image from "next/image"

const DB_ICON_SRC: Record<string, string> = {
  postgres: "/images/postgresql.svg",
  postgresql: "/images/postgresql.svg",
  mysql: "/images/mysql.svg",
  mariadb: "/images/mysql.svg",
  redis: "/images/redis.svg",
  mongodb: "/images/mongodb.svg",
  mongo: "/images/mongodb.svg",
  firebase: "/images/firebase.svg",
  supabase: "/images/supabase.svg",
  oracle: "/images/oracle.svg",
  aws: "/images/aws.svg",
  azure: "/images/azure.svg",
}

export function DbIcon({ engine, size = 20, className = "" }: { engine: string; size?: number; className?: string }) {
  const normalizedEngine = engine.toLowerCase()
  const imageSrc = DB_ICON_SRC[normalizedEngine]

  if (imageSrc) {
    return (
      <Image
        src={imageSrc}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className={`object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  const p = { width: size, height: size, viewBox: "0 0 32 32", fill: "none", className }

  switch (normalizedEngine) {

    case "postgres":
      return (
        <svg {...p}>
          {/* head */}
          <ellipse cx="14" cy="12" rx="8" ry="9" fill="#336791"/>
          {/* right tusk bump */}
          <ellipse cx="21" cy="9" rx="3" ry="4" fill="#336791"/>
          {/* ear */}
          <ellipse cx="7" cy="9" rx="3.5" ry="5" fill="#4a85b5"/>
          {/* white eye highlight */}
          <circle cx="11.5" cy="9" r="2" fill="white" opacity="0.5"/>
          <circle cx="12" cy="9" r="1" fill="#0d2b4e"/>
          {/* trunk */}
          <path d="M20 16 Q24 19 22 26" stroke="#1e4a7a" strokeWidth="3" strokeLinecap="round"/>
          {/* tusk */}
          <path d="M19 18 Q21 21 20 24" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
        </svg>
      )

    case "mysql":
      return (
        <svg {...p}>
          {/* dolphin body */}
          <path d="M4 18 Q5 10 12 8 Q19 6 22 12 Q24 17 19 20 Q14 23 10 21 Q7 19 6 22 Q5 24 7 25"
                fill="#00758f" opacity="0.2" stroke="#00758f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          {/* dorsal fin */}
          <path d="M16 9 Q18 5 20 8" stroke="#00758f" strokeWidth="2" strokeLinecap="round"/>
          {/* eye */}
          <circle cx="10" cy="12" r="1.2" fill="#00758f"/>
        </svg>
      )

    case "redis":
      return (
        <svg {...p}>
          {/* top layer */}
          <ellipse cx="16" cy="8" rx="11" ry="3.5" fill="#e74c3c"/>
          {/* body */}
          <rect x="5" y="8" width="22" height="7" fill="#dc382d"/>
          {/* middle rim */}
          <ellipse cx="16" cy="15" rx="11" ry="3.5" fill="#c0392b"/>
          {/* lower body */}
          <rect x="5" y="15" width="22" height="6" fill="#c0392b"/>
          {/* bottom */}
          <ellipse cx="16" cy="21" rx="11" ry="3.5" fill="#a93226"/>
          {/* shine */}
          <path d="M8 10 Q12 9 14 10" stroke="white" strokeWidth="1.2" strokeLinecap="round" opacity="0.35"/>
        </svg>
      )

    case "mongodb":
      return (
        <svg {...p}>
          {/* leaf */}
          <path d="M16 2 Q22 9 22 16 Q22 24 16 29 Q10 24 10 16 Q10 9 16 2Z" fill="#4db33d"/>
          {/* vein */}
          <path d="M16 29 Q14 22 14 16" stroke="#2d8a27" strokeWidth="1.8" strokeLinecap="round"/>
          {/* stem */}
          <line x1="16" y1="29" x2="16" y2="32" stroke="#4db33d" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      )

    case "clickhouse":
      return (
        <svg {...p}>
          <rect x="2"  y="2"  width="6" height="28" rx="1.5" fill="#f7a13e"/>
          <rect x="13" y="2"  width="6" height="28" rx="1.5" fill="#f7a13e"/>
          <rect x="24" y="2"  width="6" height="17" rx="1.5" fill="#f7a13e"/>
        </svg>
      )

    case "elasticsearch":
      return (
        <svg {...p}>
          <circle cx="16" cy="16" r="13" fill="#f4bd19" opacity="0.15"/>
          <circle cx="16" cy="10" r="5" fill="#f4bd19"/>
          <circle cx="16" cy="22" r="5" fill="#f4bd19"/>
          <path d="M6 13 L26 13 M6 19 L26 19" stroke="#f4bd19" strokeWidth="2" opacity="0.6"/>
        </svg>
      )

    default:
      return (
        <svg {...p} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <ellipse cx="16" cy="8"  rx="11" ry="3.5"/>
          <path d="M5 8  L5 24 Q5 27.5 16 27.5 Q27 27.5 27 24 L27 8"/>
          <path d="M5 16 Q5 19.5 16 19.5 Q27 19.5 27 16"/>
        </svg>
      )
  }
}
