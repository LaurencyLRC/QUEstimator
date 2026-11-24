CC         ?= gcc
ARCH_FLAGS ?= -march=native
CFLAGS     ?= -O3 $(ARCH_FLAGS) -fopenmp -std=c11 -Wall -Wextra -fno-math-errno -MMD -MP
LDFLAGS    ?= -fopenmp -lm

ifeq ($(OS),Windows_NT)
  EXT := .exe
else
  EXT :=
endif

TARGET := questimator_calc$(EXT)
SRCS   := main.c json.c data.c grm.c nuts.c diag.c
OBJS   := $(SRCS:.c=.o)
DEPS   := $(OBJS:.o=.d)

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $(OBJS) $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

-include $(DEPS)

test: $(TARGET)
	./$(TARGET) --check-grad

clean:
	rm -f $(OBJS) $(DEPS) $(TARGET)
