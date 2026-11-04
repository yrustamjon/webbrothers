package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"webbrothers/agent/internal/identity"
)

// rePair requires a new locally consented enrollment; old state survives failures.
func rePair(ctx context.Context, server, state, pass, scopes string) error {
	if _, err := os.Stat(state); os.IsNotExist(err) {
		return pair(ctx, server, state, pass, scopes)
	} else if err != nil {
		return errors.New("Mahalliy identifikatorni tekshirib boʻlmadi")
	}
	if _, err := identity.Load(state, pass); err != nil {
		return err
	}
	dir, err := os.MkdirTemp(filepath.Dir(state), ".enrollment-")
	if err != nil {
		return errors.New("Yangi ulash uchun mahalliy katalog yaratilmagan")
	}
	defer os.RemoveAll(dir)
	next := filepath.Join(dir, "identity.enc")
	if err := pair(ctx, server, next, pass, scopes); err != nil {
		return err
	}
	if ctx.Err() != nil {
		return ctx.Err()
	}
	if _, err := identity.Load(next, pass); err != nil {
		return errors.New("Yangi ulash yakunlanmadi; eski identifikator saqlandi")
	}
	backup := state + ".backup-" + filepath.Base(dir)
	if err := replaceEnrollment(state, next, backup); err != nil {
		return err
	}
	fmt.Println("Yangi ruxsatlar tasdiqlandi. Eski qurilma ruxsatini dashboardda bekor qiling; mahalliy zaxira saqlandi.")
	return nil
}

func replaceEnrollment(current, next, backup string) error {
	if _, err := os.Stat(next); err != nil {
		return errors.New("Yangi identifikator topilmadi; eski ulanish saqlandi")
	}
	if _, err := os.Stat(backup); !os.IsNotExist(err) {
		return errors.New("Zaxira joyi band; eski ulanish saqlandi")
	}
	if err := os.Rename(current, backup); err != nil {
		return errors.New("Eski ulanish zaxiralanmadi; almashtirish toʻxtatildi")
	}
	if err := os.Rename(next, current); err != nil {
		if rollback := os.Rename(backup, current); rollback != nil {
			return errors.New("Ulanish almashtirilmadi; eski identifikator zaxira faylida saqlangan")
		}
		return errors.New("Ulanish almashtirilmadi; eski identifikator tiklandi")
	}
	return nil
}
