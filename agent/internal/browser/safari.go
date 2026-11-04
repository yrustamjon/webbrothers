package browser

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

const safariEpoch = int64(978307200) // 2001-01-01 UTC, in Unix seconds.

// safariHistory returns individual visits, including repeated visits to one URL.
// VisitCount is Safari's cumulative per-URL count, not a count of filtered rows.
func safariHistory(profile string, q Query) (Page, error) {
	result := Page{Items: []Visit{}, Page: q.Page, PageSize: q.PageSize}
	file := filepath.Join(profile, "History.db")
	if !within(profile, file) {
		return result, errors.New("Safari tarixi topilmadi yoki OS oʻqish ruxsatini bermadi")
	}
	uri, err := historyURI(file)
	if err != nil {
		return result, errors.New("Safari tarixi yoʻli yaroqsiz")
	}
	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return result, errors.New("Safari tarixi ochilmadi; OS oʻqish ruxsatini tekshiring")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	query := `SELECT substr(i.url,1,8192), substr(COALESCE(v.title,''),1,2048), v.visit_time, COALESCE(i.visit_count,0)
		FROM history_visits v JOIN history_items i ON i.id=v.history_item
		WHERE (i.url LIKE ? ESCAPE '\' OR v.title LIKE ? ESCAPE '\')`
	search := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q.Search)
	args := []any{"%" + search + "%", "%" + search + "%"}
	for _, filter := range []struct{ value, op string }{{q.Start, ">="}, {q.End, "<="}} {
		if filter.value == "" {
			continue
		}
		parsed, err := time.Parse(time.RFC3339, filter.value)
		if err != nil {
			return result, errors.New("Sana formati notoʻgʻri")
		}
		seconds := float64(parsed.Unix()-safariEpoch) + float64(parsed.Nanosecond())/1e9
		query += " AND v.visit_time " + filter.op + " ?"
		args = append(args, seconds)
	}
	order := "DESC"
	if q.Sort == "asc" {
		order = "ASC"
	} else if q.Sort != "" && q.Sort != "desc" {
		return result, errors.New("Saralash notoʻgʻri")
	}
	query += " ORDER BY v.visit_time " + order + ", v.id " + order + " LIMIT ? OFFSET ?"
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return result, errors.New("Safari bazasi band, sxemasi qoʻllanmaydi yoki OS oʻqish ruxsatini bermadi")
	}
	defer rows.Close()
	for rows.Next() {
		var item Visit
		var seconds sql.NullFloat64
		if err := rows.Scan(&item.URL, &item.Title, &seconds, &item.VisitCount); err != nil {
			return result, errors.New("Safari tarixi yozuvi oʻqilmadi")
		}
		if seconds.Valid {
			if math.IsNaN(seconds.Float64) || math.IsInf(seconds.Float64, 0) || math.Abs(seconds.Float64) > 253402300799 {
				return result, errors.New("Safari tashrif vaqti yaroqsiz")
			}
			whole, fraction := math.Modf(seconds.Float64)
			item.VisitedAt = time.Unix(int64(whole)+safariEpoch, int64(math.Round(fraction*1e9))).UTC().Format(time.RFC3339Nano)
		}
		parsed, err := url.Parse(item.URL)
		if err == nil {
			item.Domain = parsed.Hostname()
		}
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return result, errors.New("Safari tarixini oʻqish yakunlanmadi")
	}
	return result, nil
}
