import {
  PostgreSQL, MySQL, MariaDB, Redis, MongoDB, ClickHouse,
  Elastic, Supabase, Firebase, Oracle, AWS, Azure, CassandraDB,
} from "developer-icons"

type DeveloperIcon = React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>

const ENGINE_MAP: Record<string, DeveloperIcon> = {
  postgres:      PostgreSQL,
  postgresql:    PostgreSQL,
  mysql:         MySQL,
  mariadb:       MariaDB,
  redis:         Redis,
  mongodb:       MongoDB,
  mongo:         MongoDB,
  clickhouse:    ClickHouse,
  elasticsearch: Elastic,
  supabase:      Supabase,
  firebase:      Firebase,
  oracle:        Oracle,
  aws:           AWS,
  azure:         Azure,
  cassandra:     CassandraDB,
}

export function DbIcon({ engine, size = 20, className = "" }: { engine: string; size?: number; className?: string }) {
  const Icon = ENGINE_MAP[engine.toLowerCase()]
  if (Icon) return <Icon size={size} className={className} />

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={className}>
      <ellipse cx="16" cy="8"  rx="11" ry="3.5"/>
      <path d="M5 8  L5 24 Q5 27.5 16 27.5 Q27 27.5 27 24 L27 8"/>
      <path d="M5 16 Q5 19.5 16 19.5 Q27 19.5 27 16"/>
    </svg>
  )
}
