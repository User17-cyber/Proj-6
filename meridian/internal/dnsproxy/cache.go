package dnsproxy

import (
	"strconv"
	"sync"
	"time"

	"golang.org/x/net/dns/dnsmessage"
)

const (
	maxCacheTTL      = time.Hour
	negativeCacheTTL = 5 * time.Minute
)

type cacheEntry struct {
	msg     []byte
	stored  time.Time
	expires time.Time
}

// cache is a small DNS answer cache with TTL ageing.
type cache struct {
	mu   sync.Mutex
	max  int
	data map[string]cacheEntry
}

func newCache(max int) *cache { return &cache{max: max, data: map[string]cacheEntry{}} }

func cacheKey(q question) string {
	return q.Name + "|" + strconv.Itoa(int(q.Type)) + "|" + strconv.Itoa(int(q.Class))
}

func cacheTTL(ai answerInfo) (time.Duration, bool) {
	switch ai.RCode {
	case dnsmessage.RCodeSuccess:
		if ai.Answers > 0 && ai.HasTTL {
			if ai.MinTTL == 0 {
				return 0, false
			}
			return min(time.Duration(ai.MinTTL)*time.Second, maxCacheTTL), true
		}
		fallthrough // NODATA
	case dnsmessage.RCodeNameError:
		if ai.HasSOA && ai.SOAMin > 0 {
			return min(time.Duration(ai.SOAMin)*time.Second, negativeCacheTTL), true
		}
		return 0, false
	}
	return 0, false
}

func (c *cache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	e, ok := c.data[key]
	c.mu.Unlock()
	if !ok {
		return nil, false
	}
	now := time.Now()
	if now.After(e.expires) {
		return nil, false
	}
	out := append([]byte(nil), e.msg...)
	if !ageTTLs(out, uint32(now.Sub(e.stored)/time.Second)) {
		return nil, false
	}
	return out, true
}

func (c *cache) put(key string, msg []byte, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.data) >= c.max {
		// Evict expired entries first, then arbitrary ones.
		now := time.Now()
		for k, e := range c.data {
			if now.After(e.expires) {
				delete(c.data, k)
			}
		}
		for k := range c.data {
			if len(c.data) < c.max*9/10 {
				break
			}
			delete(c.data, k)
		}
	}
	now := time.Now()
	c.data[key] = cacheEntry{msg: append([]byte(nil), msg...), stored: now, expires: now.Add(ttl)}
}

func (c *cache) expire() {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	for k, e := range c.data {
		if now.After(e.expires) {
			delete(c.data, k)
		}
	}
}

func (c *cache) clear() {
	c.mu.Lock()
	c.data = map[string]cacheEntry{}
	c.mu.Unlock()
}
