CC      ?= gcc
CFLAGS  ?= -O3 -march=native -fopenmp -std=c11 -Wall -Wextra -fno-math-errno
LDFLAGS ?= -fopenmp -lm

ifeq ($(OS),Windows_NT)
  EXT := .exe
else
  EXT :=
endif

TARGET := questimator_calc$(EXT)
SRCS   := main.c json.c data.c grm.c nuts.c diag.c
OBJS   := $(SRCS:.c=.o)

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

test: $(TARGET)
	./$(TARGET) --check-grad

clean:
	rm -f $(OBJS) $(TARGET)
